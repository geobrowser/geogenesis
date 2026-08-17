import { Effect } from 'effect';

import { Environment } from '~/core/environment';
import { uuidToHex } from '~/core/id/normalize';
import { getBatchEntities, getRelationsByToEntityIds, getSpaces } from '~/core/io/queries';
import { fetchProposal } from '~/core/io/subgraph/fetch-proposal';
import { graphql } from '~/core/io/subgraph/graphql';
import type { Entity } from '~/core/types';

import type { BountyBacklink } from './fetch-bounty-detail';
import type { PayoutItem, ProposalGovernanceStatus, SubmissionItem } from './group-submissions';
import {
  BOUNTY_REVIEW_TYPE_ID,
  PAYOUT_AMOUNT_PROPERTY_ID,
  PAYOUT_BOUNTY_PROPERTY_ID,
  PAYOUT_PROPOSALS_PROPERTY_ID,
  PAYOUT_RECIPIENT_PROPERTY_ID,
  REVIEW_ACCURACY_RATING_PROPERTY_ID,
  REVIEW_COMMENT_PROPERTY_ID,
  REVIEW_COMPLETENESS_RATING_PROPERTY_ID,
  REVIEW_EFFORT_RATING_PROPERTY_ID,
  REVIEW_PASS_PROPERTY_ID,
  REVIEW_PROPOSALS_PROPERTY_ID,
  REVIEW_SKILL_RATING_PROPERTY_ID,
} from './ontology';

function toDate(raw: string | number | undefined | null): Date {
  if (raw == null) return new Date(0);
  if (typeof raw === 'number') return new Date(raw * 1000);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms) : new Date(0);
}

function valueOf(entity: Entity, propertyId: string): string | null {
  return entity.values.find(v => v.property.id === propertyId)?.value ?? null;
}

// -- Submissions ------------------------------------------------------------------

/**
 * Submission rows are proposals linked to the bounty. Each link relation lives
 * in the creator's PERSONAL space (that is how the review flow publishes it),
 * so the relation's spaceId identifies the creator: the personal space's
 * topicId is their person entity — the canonical identity curator-app uses in
 * lifecycle keys — with the space id itself as the fallback.
 */
export function fetchSubmissionItems(submissionLinks: readonly BountyBacklink[], bountySpaceId: string) {
  return Effect.gen(function* () {
    if (submissionLinks.length === 0) return [] as SubmissionItem[];

    const proposalIds = [...new Set(submissionLinks.map(link => uuidToHex(link.fromEntityId)))];
    const creatorSpaceIds = [...new Set(submissionLinks.map(link => uuidToHex(link.spaceId)))];

    const [proposalEntities, creatorSpaces] = yield* Effect.all(
      [getBatchEntities(proposalIds), getSpaces({ spaceIds: creatorSpaceIds })],
      { concurrency: 2 }
    );

    const proposalsById = new Map(proposalEntities.map(entity => [uuidToHex(entity.id), entity]));
    const spacesById = new Map(creatorSpaces.map(space => [uuidToHex(space.id), space]));

    return submissionLinks.map((link): SubmissionItem => {
      const proposal = proposalsById.get(uuidToHex(link.fromEntityId));
      const space = spacesById.get(uuidToHex(link.spaceId));
      return {
        id: link.id,
        entityId: uuidToHex(link.fromEntityId),
        name: proposal?.name?.trim() || 'Untitled proposal',
        creatorEntityId: space ? uuidToHex(space.topicId ?? space.id) : uuidToHex(link.spaceId),
        creatorName: space?.entity?.name?.trim() || null,
        spaceId: bountySpaceId,
        createdAt: toDate(proposal?.createdAt),
      };
    });
  });
}

/** Best-effort governance status per proposal; failures leave the proposal Pending. */
export function fetchProposalStatuses(proposalIds: readonly string[]) {
  return Effect.gen(function* () {
    const statuses = new Map<string, ProposalGovernanceStatus>();
    const results = yield* Effect.all(
      proposalIds.map(id =>
        Effect.tryPromise({ try: () => fetchProposal({ id }), catch: () => null }).pipe(
          Effect.catchAll(() => Effect.succeed(null))
        )
      ),
      { concurrency: 4 }
    );
    results.forEach((proposal, index) => {
      if (proposal?.status) statuses.set(uuidToHex(proposalIds[index]), proposal.status as ProposalGovernanceStatus);
    });
    return statuses;
  });
}

// -- Payouts ------------------------------------------------------------------------

type PayoutRelationsResult = {
  relations: Array<{
    id: string;
    toEntityId: string;
    spaceId: string;
    entity: {
      id: string;
      name: string | null;
      createdAt: string | null;
      valuesList: Array<{ propertyId: string; decimal: string | null }>;
      relationsList: Array<{ typeId: string; toEntityId: string }>;
    } | null;
  }>;
};

/**
 * Payouts for a bounty. Discovered via the payout entity's `Payout Bounty`
 * backlink, then read as the outer `Payout Recipient` relation (recipient on
 * the relation, amount/proposals on its relation-entity) — the exact shape
 * curator-app writes, so payouts authored by either app appear in both.
 */
export function fetchPayoutItems(bountyId: string, recipientNames?: ReadonlyMap<string, string | null>) {
  return Effect.gen(function* () {
    const bountyLinks = yield* getRelationsByToEntityIds([bountyId], PAYOUT_BOUNTY_PROPERTY_ID);
    const payoutEntityIds = [...new Set(bountyLinks.map(link => uuidToHex(link.fromEntityId)))];
    if (payoutEntityIds.length === 0) return [] as PayoutItem[];

    const query = `query {
      relations(filter: {
        typeId: { is: "${PAYOUT_RECIPIENT_PROPERTY_ID}" }
        entityId: { in: [${payoutEntityIds.map(id => `"${id}"`).join(', ')}] }
      }) {
        id
        toEntityId
        spaceId
        entity {
          id
          name
          createdAt
          valuesList(first: 50) { propertyId decimal }
          relationsList(first: 200) { typeId toEntityId }
        }
      }
    }`;

    const result = yield* graphql<PayoutRelationsResult>({ endpoint: Environment.getConfig().api, query });

    return result.relations
      .filter(relation => relation.entity)
      .map((relation): PayoutItem => {
        const entity = relation.entity!;
        const amountRaw = entity.valuesList.find(v => v.propertyId === PAYOUT_AMOUNT_PROPERTY_ID)?.decimal ?? '0';
        const amount = Number(amountRaw);
        const recipientEntityId = uuidToHex(relation.toEntityId);
        return {
          id: uuidToHex(relation.id),
          payoutEntityId: uuidToHex(entity.id),
          recipientEntityId,
          recipientName: recipientNames?.get(recipientEntityId) ?? null,
          amount: Number.isFinite(amount) ? amount : 0,
          proposalIds: entity.relationsList
            .filter(r => r.typeId === PAYOUT_PROPOSALS_PROPERTY_ID)
            .map(r => uuidToHex(r.toEntityId)),
          createdAt: toDate(entity.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
}

// -- Reviews -----------------------------------------------------------------------

export type BountyReview = {
  id: string;
  /** The reviewer's personal space (where the review lives). */
  spaceId: string;
  proposalIds: string[];
  pass: boolean;
  comment: string | null;
  ratings: { completeness: number; accuracy: number; skill: number; effort: number };
  createdAt: Date;
};

/** Reviews covering any of the proposals: Proposals backlinks → from-entities filtered to the Bounty review type. */
export function fetchBountyReviews(proposalIds: readonly string[]) {
  return Effect.gen(function* () {
    if (proposalIds.length === 0) return [] as BountyReview[];
    const links = yield* getRelationsByToEntityIds([...proposalIds], REVIEW_PROPOSALS_PROPERTY_ID);
    const candidateIds = [...new Set(links.map(link => uuidToHex(link.fromEntityId)))];
    if (candidateIds.length === 0) return [] as BountyReview[];

    const entities = yield* getBatchEntities(candidateIds);
    const spaceByEntity = new Map(links.map(link => [uuidToHex(link.fromEntityId), link.spaceId]));

    return entities
      .filter(entity => entity.types.some(type => uuidToHex(type.id) === BOUNTY_REVIEW_TYPE_ID))
      .map((entity): BountyReview => {
        const rating = (propertyId: string) => {
          const parsed = Number(valueOf(entity, propertyId));
          return Number.isFinite(parsed) ? parsed : 0;
        };
        return {
          id: uuidToHex(entity.id),
          spaceId: spaceByEntity.get(uuidToHex(entity.id)) ?? entity.spaces[0] ?? '',
          proposalIds: entity.relations
            .filter(r => r.type.id === REVIEW_PROPOSALS_PROPERTY_ID)
            .map(r => uuidToHex(r.toEntity.id)),
          pass: valueOf(entity, REVIEW_PASS_PROPERTY_ID) === 'true',
          comment: valueOf(entity, REVIEW_COMMENT_PROPERTY_ID),
          ratings: {
            completeness: rating(REVIEW_COMPLETENESS_RATING_PROPERTY_ID),
            accuracy: rating(REVIEW_ACCURACY_RATING_PROPERTY_ID),
            skill: rating(REVIEW_SKILL_RATING_PROPERTY_ID),
            effort: rating(REVIEW_EFFORT_RATING_PROPERTY_ID),
          },
          createdAt: toDate(entity.createdAt),
        };
      });
  });
}
