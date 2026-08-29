import { Effect, Either, Schema } from 'effect';

import {
  BOUNTIES_RELATION_TYPE,
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_DEADLINE_PROPERTY_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
  BOUNTY_TYPE_ID,
  PAYOUT_AMOUNT_PROPERTY_ID,
  PAYOUT_BOUNTY_PROPERTY_ID,
  PAYOUT_PROPOSALS_PROPERTY_ID,
  PAYOUT_RECIPIENT_PROPERTY_ID,
  PAYOUT_TYPE_ID,
} from '~/core/constants';
import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { ApiProposalDiffResponseSchema, encodePathSegment, restFetch } from '~/core/io/rest';
import type { ApiEntityDiff } from '~/core/io/rest';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';

import { buildAccretionDashboard, classifyArtifactOperation } from './accretion-metrics';
import { accretionPeriodStart } from './accretion-metrics';
import type {
  AccretionArtifact,
  AccretionBountyInput,
  AccretionDashboardResult,
  AccretionPayoutInput,
  AccretionPeriod,
  AccretionProposalInput,
  AccretionProposalOutputInput,
} from './accretion-types';
import { ID_CHUNK_SIZE, afterArg, chunk, collectConnection, gqlId, gqlIdList, runQuery } from './community-graphql';
import { toUnixSeconds } from './curator-leaderboard-period';

const ENTITY_PAGE_SIZE = 100;
const RELATION_PAGE_SIZE = 500;
const DIFF_PROPOSAL_LIMIT = 24;
const DIFF_CONCURRENCY = 6;
const DIFF_MAX_PAGES = 10;

type GraphValue = {
  propertyId: string;
  text: string | null;
  float: number | null;
  decimal: string | null;
  integer: string | null;
  date: string | null;
  datetime: string | null;
};

type RelationTarget = {
  id: string;
  name: string | null;
};

type GraphRelation = {
  typeId: string;
  toEntity: RelationTarget;
};

type BountyNode = {
  id: string;
  name: string | null;
  createdAt: string | null;
  valuesList: GraphValue[];
  relationsList: GraphRelation[];
};

type PayoutNode = {
  id: string;
  createdAt: string | null;
  valuesList: GraphValue[];
  relationsList: GraphRelation[];
};

type ProposalLink = {
  fromEntityId: string;
  toEntityId: string;
};

type IndexedProposal = {
  id: string;
  spaceId: string;
  proposedBy: string;
  createdAt: string | null;
  executedAt: string | null;
};

function numberFromValue(value: GraphValue | undefined): number | null {
  if (!value) return null;
  const candidates: unknown[] = [value.decimal, value.float, value.integer, value.text];
  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue;
    const normalized = typeof candidate === 'string' ? candidate.replace(/[^0-9.-]/g, '') : candidate;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function valueFor(node: { valuesList: GraphValue[] }, propertyId: string): GraphValue | undefined {
  return node.valuesList.find(value => ID.equals(value.propertyId, propertyId));
}

function targetsFor(node: { relationsList: GraphRelation[] }, propertyId: string): RelationTarget[] {
  return node.relationsList
    .filter(relation => ID.equals(relation.typeId, propertyId))
    .map(relation => relation.toEntity);
}

async function fetchBounties(spaceHex: string) {
  return collectConnection<BountyNode>(
    'accretion bounties',
    after => `query {
      entitiesConnection(
        first: ${ENTITY_PAGE_SIZE}${afterArg(after)}
        spaceId: "${spaceHex}"
        typeId: "${gqlId(BOUNTY_TYPE_ID)}"
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes {
          id
          name
          createdAt
          valuesList(first: 50) { propertyId text float decimal integer date datetime }
          relationsList(first: 100) { typeId toEntity { id name } }
        }
      }
    }`,
    data => data.entitiesConnection
  );
}

async function fetchPayouts(spaceHex: string) {
  return collectConnection<PayoutNode>(
    'accretion payouts',
    after => `query {
      entitiesConnection(
        first: ${ENTITY_PAGE_SIZE}${afterArg(after)}
        spaceId: "${spaceHex}"
        typeId: "${gqlId(PAYOUT_TYPE_ID)}"
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes {
          id
          createdAt
          valuesList(first: 30) { propertyId text float decimal integer date datetime }
          relationsList(first: 100) { typeId toEntity { id name } }
        }
      }
    }`,
    data => data.entitiesConnection
  );
}

async function fetchProposalLinks(spaceHex: string) {
  return collectConnection<ProposalLink>(
    'accretion bounty proposal links',
    after => `query {
      relationsConnection(
        first: ${RELATION_PAGE_SIZE}${afterArg(after)}
        filter: {
          typeId: { is: "${gqlId(BOUNTIES_RELATION_TYPE)}" }
          toSpaceId: { is: "${spaceHex}" }
        }
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes { fromEntityId toEntityId }
      }
    }`,
    data => data.relationsConnection
  );
}

async function fetchIndexedProposals(proposalIds: string[]): Promise<IndexedProposal[]> {
  if (proposalIds.length === 0) return [];
  const pages = await mapWithConcurrency(chunk(proposalIds, ID_CHUNK_SIZE), 6, ids =>
    runQuery<{ proposalsConnection?: { nodes: IndexedProposal[] } }>(
      'accretion indexed proposals',
      `query {
        proposalsConnection(
          first: ${ids.length}
          filter: { id: { in: [${gqlIdList(ids)}] } }
        ) {
          nodes { id spaceId proposedBy createdAt executedAt }
        }
      }`
    )
  );
  return pages.flatMap(page => page.proposalsConnection?.nodes ?? []);
}

async function fetchProposalDiff(proposalId: string, spaceId: string): Promise<ApiEntityDiff[] | null> {
  const endpoint = Environment.getConfig().api;
  const entities: ApiEntityDiff[] = [];
  let cursor: string | null = null;

  for (let pageIndex = 0; pageIndex < DIFF_MAX_PAGES; pageIndex++) {
    const params = new URLSearchParams({ spaceId, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const path = `/versioned/proposals/${encodePathSegment(proposalId)}/diff?${params.toString()}`;
    const result = await Effect.runPromise(Effect.either(restFetch<unknown>({ endpoint, path })));
    if (Either.isLeft(result)) return null;

    const decoded = Schema.decodeUnknownEither(ApiProposalDiffResponseSchema)(result.right);
    if (Either.isLeft(decoded)) return null;
    entities.push(...decoded.right.entities);

    if (!decoded.right.pagination.hasMore || !decoded.right.pagination.cursor) return entities;
    cursor = decoded.right.pagination.cursor;
  }

  return entities;
}

type EntityTypeNode = {
  id: string;
  types: { id: string; name: string | null }[] | null;
};

async function fetchArtifactTypes(entityIds: string[]): Promise<Map<string, { id: string; name: string }>> {
  const byEntityId = new Map<string, { id: string; name: string }>();
  if (entityIds.length === 0) return byEntityId;

  const pages = await mapWithConcurrency(chunk(entityIds, ID_CHUNK_SIZE), 6, ids =>
    runQuery<{ entitiesConnection?: { nodes: EntityTypeNode[] } }>(
      'accretion artifact types',
      `query {
        entitiesConnection(first: ${ids.length}, filter: { id: { in: [${gqlIdList(ids)}] } }) {
          nodes { id types { id name } }
        }
      }`
    ).catch(() => ({ entitiesConnection: { nodes: [] } }))
  );

  const metaTypes = new Set(['Type', 'Property', 'Space']);
  for (const page of pages) {
    for (const entity of page.entitiesConnection?.nodes ?? []) {
      const namedTypes = (entity.types ?? []).filter(type => type.name);
      const selected = namedTypes.find(type => !metaTypes.has(type.name as string)) ?? namedTypes[0];
      if (selected?.name) byEntityId.set(entity.id, { id: selected.id, name: selected.name });
    }
  }

  return byEntityId;
}

function mapBounty(node: BountyNode): AccretionBountyInput {
  const deadlineValue = valueFor(node, BOUNTY_DEADLINE_PROPERTY_ID);
  const curatorTargets = targetsFor(node, BOUNTY_ALLOCATED_PROPERTY_ID);
  return {
    id: node.id,
    name: node.name?.trim() || 'Untitled bounty',
    createdAt: toUnixSeconds(node.createdAt),
    budget: numberFromValue(valueFor(node, BOUNTY_BUDGET_PROPERTY_ID)),
    deadline: toUnixSeconds(deadlineValue?.datetime ?? deadlineValue?.date ?? deadlineValue?.text),
    status: targetsFor(node, BOUNTY_TASK_STATUS_PROPERTY_ID)[0]?.name?.trim() ?? null,
    curatorIds: [...new Set(curatorTargets.map(target => target.id))],
    curatorNames: Object.fromEntries(
      curatorTargets.map(target => [target.id, target.name?.trim() || `Curator ${target.id.slice(0, 6)}`])
    ),
  };
}

function mapPayout(node: PayoutNode): AccretionPayoutInput {
  const bounty = targetsFor(node, PAYOUT_BOUNTY_PROPERTY_ID)[0];
  const recipient = targetsFor(node, PAYOUT_RECIPIENT_PROPERTY_ID)[0];
  return {
    id: node.id,
    bountyId: bounty?.id ?? null,
    proposalIds: [...new Set(targetsFor(node, PAYOUT_PROPOSALS_PROPERTY_ID).map(target => target.id))],
    amount: numberFromValue(valueFor(node, PAYOUT_AMOUNT_PROPERTY_ID)),
    createdAt: toUnixSeconds(node.createdAt),
    recipientId: recipient?.id ?? null,
    recipientName: recipient?.name?.trim() ?? null,
  };
}

function mapProposal(
  proposal: IndexedProposal,
  bountyIds: string[],
  profileName: string | null
): AccretionProposalInput {
  return {
    id: proposal.id,
    spaceId: proposal.spaceId,
    bountyIds,
    proposedBy: proposal.proposedBy,
    proposedByName: profileName,
    createdAt: toUnixSeconds(proposal.createdAt),
    executedAt: toUnixSeconds(proposal.executedAt),
  };
}

function buildProposalOutputs(
  proposalDiffs: { proposalId: string; diffs: ApiEntityDiff[] }[],
  typeByEntityId: Map<string, { id: string; name: string }>
): AccretionProposalOutputInput[] {
  return proposalDiffs.map(({ proposalId, diffs }) => ({
    proposalId,
    artifacts: diffs.map((diff): AccretionArtifact => {
      const entityType = typeByEntityId.get(diff.entityId);
      const isStructural = !entityType && diff.values.length === 0 && diff.relations.length > 0;
      return {
        entityId: diff.entityId,
        typeId: entityType?.id ?? null,
        typeName: entityType?.name ?? (isStructural ? 'Structure' : 'Untyped entity'),
        operation: classifyArtifactOperation(diff),
        weightedUnits: 1,
      };
    }),
  }));
}

export async function fetchAccretionDashboard({
  spaceId,
  period,
  now = Date.now(),
}: {
  spaceId: string;
  period: AccretionPeriod;
  now?: number;
}): Promise<AccretionDashboardResult> {
  const spaceHex = gqlId(spaceId);
  if (!spaceHex) throw new Error('Invalid space id');

  const [bountyResult, payoutResult, proposalLinkResult] = await Promise.all([
    fetchBounties(spaceHex),
    fetchPayouts(spaceHex),
    fetchProposalLinks(spaceHex),
  ]);

  const bounties = bountyResult.nodes.map(mapBounty);
  const payouts = payoutResult.nodes.map(mapPayout);
  const bountyIdsByProposalId = new Map<string, string[]>();
  for (const link of proposalLinkResult.nodes) {
    const ids = bountyIdsByProposalId.get(link.fromEntityId) ?? [];
    if (!ids.includes(link.toEntityId)) ids.push(link.toEntityId);
    bountyIdsByProposalId.set(link.fromEntityId, ids);
  }

  const proposalIds = [...new Set([...bountyIdsByProposalId.keys(), ...payouts.flatMap(payout => payout.proposalIds)])];
  const indexedProposals = await fetchIndexedProposals(proposalIds);

  const authorIds = [...new Set(indexedProposals.map(proposal => proposal.proposedBy).filter(Boolean))];
  const profiles = authorIds.length > 0 ? await Effect.runPromise(fetchProfilesBySpaceIds(authorIds)) : [];
  const profileNameBySpaceId = new Map(
    authorIds.map((id, index) => [ID.uuidToHex(id), profiles[index]?.name?.trim() ?? null])
  );
  const proposals = indexedProposals.map(proposal =>
    mapProposal(
      proposal,
      bountyIdsByProposalId.get(proposal.id) ?? [],
      profileNameBySpaceId.get(ID.uuidToHex(proposal.proposedBy)) ?? null
    )
  );

  const nowSeconds = Math.floor(now / 1000);
  const periodStart = accretionPeriodStart(period, nowSeconds);
  const periodPayoutProposalIds = new Set(
    payouts
      .filter(payout => payout.createdAt !== null && (periodStart === null || payout.createdAt >= periodStart))
      .flatMap(payout => payout.proposalIds)
  );
  const relevantAccepted = proposals
    .filter(
      proposal =>
        proposal.executedAt !== null &&
        (periodStart === null || proposal.executedAt >= periodStart || periodPayoutProposalIds.has(proposal.id))
    )
    .sort((a, b) => (b.executedAt ?? 0) - (a.executedAt ?? 0));
  const acceptedById = new Map(relevantAccepted.map(proposal => [proposal.id, proposal]));
  const selectedIds = new Set<string>();
  const periodPayoutsByRecency = payouts
    .filter(payout => payout.createdAt !== null && (periodStart === null || payout.createdAt >= periodStart))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  // Complete payout bundles produce defensible unit costs. A plain "latest N proposals" sample
  // usually captures only part of each many-to-many payout, which correctly gets excluded by the
  // metric transformer but leaves the deck empty even when good linked data exists.
  for (const payout of periodPayoutsByRecency) {
    const bundleIds = [...new Set(payout.proposalIds)].filter(id => acceptedById.has(id));
    const missingIds = bundleIds.filter(id => !selectedIds.has(id));
    if (missingIds.length > 0 && selectedIds.size + missingIds.length <= DIFF_PROPOSAL_LIMIT) {
      missingIds.forEach(id => selectedIds.add(id));
    }
  }
  for (const proposal of relevantAccepted) {
    if (selectedIds.size >= DIFF_PROPOSAL_LIMIT) break;
    selectedIds.add(proposal.id);
  }
  const selectedProposals = [...selectedIds]
    .map(id => acceptedById.get(id))
    .filter((proposal): proposal is AccretionProposalInput => proposal !== undefined);
  const diffResults = await mapWithConcurrency(selectedProposals, DIFF_CONCURRENCY, async proposal => ({
    proposalId: proposal.id,
    diffs: await fetchProposalDiff(proposal.id, proposal.spaceId),
  }));
  const successfulDiffs = diffResults.filter(
    (result): result is { proposalId: string; diffs: ApiEntityDiff[] } => result.diffs !== null
  );
  const artifactEntityIds = [...new Set(successfulDiffs.flatMap(result => result.diffs.map(diff => diff.entityId)))];
  const typeByEntityId = await fetchArtifactTypes(artifactEntityIds);
  const proposalOutputs = buildProposalOutputs(successfulDiffs, typeByEntityId);

  return buildAccretionDashboard({
    period,
    nowSeconds,
    bounties,
    proposals,
    payouts,
    proposalOutputs,
    diffProposalLimit: DIFF_PROPOSAL_LIMIT,
    diffLimitReached: relevantAccepted.length > DIFF_PROPOSAL_LIMIT,
    sourceTruncated: bountyResult.truncated || payoutResult.truncated || proposalLinkResult.truncated,
  });
}
