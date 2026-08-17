import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { uuidToHex } from '~/core/id/normalize';
import { getEntity, getRelationsByToEntityIds, getSpaces } from '~/core/io/queries';
import type { Relation } from '~/core/types';

import { bountySpaceFallbackLabel, spaceRowsById, toBoardBounty } from './fetch-bounties';
import {
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_SUBMISSION_PROPERTY_ID,
  INTERESTED_IN_BOUNTY_PROPERTY_ID,
} from './ontology';
import type { BoardBounty } from './types';

/**
 * A backlink row on the bounty. Interest rows come from curators' personal
 * spaces; submission rows come from proposals. Kept raw (not just counted)
 * because cancelling interest must delete every duplicate row a curator has,
 * and submissions are grouped per creator downstream.
 */
export type BountyBacklink = {
  id: string;
  fromEntityId: string;
  spaceId: string;
};

export type BountyDetail = {
  bounty: BoardBounty;
  interest: BountyBacklink[];
  submissions: BountyBacklink[];
  /** The bounty's own Allocated relation rows (needed to tombstone on removal). */
  allocationRelations: Relation[];
};

function toBacklink(relation: { id: string; fromEntityId: string; spaceId: string }): BountyBacklink {
  return { id: relation.id, fromEntityId: relation.fromEntityId, spaceId: relation.spaceId };
}

/** Distinct interested curators (a curator may hold duplicate interest rows). */
export function distinctInterestedIds(interest: readonly BountyBacklink[]): string[] {
  return [...new Set(interest.map(row => uuidToHex(row.fromEntityId)))];
}

export function fetchBountyDetail(spaceId: string, bountyId: string) {
  return Effect.gen(function* () {
    const [entity, spaces, interestRelations, submissionRelations] = yield* Effect.all(
      [
        getEntity(bountyId, spaceId),
        getSpaces({ spaceIds: [spaceId] }),
        // No space filter: interest lives in each curator's personal space.
        getRelationsByToEntityIds([bountyId], INTERESTED_IN_BOUNTY_PROPERTY_ID),
        getRelationsByToEntityIds([bountyId], BOUNTY_SUBMISSION_PROPERTY_ID),
      ],
      { concurrency: 4 }
    );

    if (!entity) return null;

    const bounty = toBoardBounty(entity, spaceId);
    const row = spaceRowsById(spaces, [spaceId]).get(spaceId);
    bounty.spaceLabel = row?.label ?? bountySpaceFallbackLabel(spaceId);
    bounty.spaceImage = row?.image ?? PLACEHOLDER_SPACE_IMAGE;

    const interest = interestRelations.map(toBacklink);
    const submissions = submissionRelations.map(toBacklink);
    bounty.interestedCount = distinctInterestedIds(interest).length;
    bounty.submissionsCount = submissions.length;

    const allocationRelations = (entity.relations ?? []).filter(r => r.type.id === BOUNTY_ALLOCATED_PROPERTY_ID);

    return { bounty, interest, submissions, allocationRelations } satisfies BountyDetail;
  });
}
