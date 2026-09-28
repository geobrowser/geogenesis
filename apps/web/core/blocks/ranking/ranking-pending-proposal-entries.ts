import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { EntityDiff } from '~/core/utils/diff';

import type { RankingEntryDisplay } from './use-ranking-entry-entities';

export type RankingPendingProposalData = {
  pendingEntityIds: ReadonlySet<string>;
  entriesByEntityId: ReadonlyMap<string, RankingEntryDisplay>;
};

export const EMPTY_RANKING_PENDING_PROPOSAL_DATA: RankingPendingProposalData = {
  pendingEntityIds: new Set<string>(),
  entriesByEntityId: new Map<string, RankingEntryDisplay>(),
};

export function isPlaceholderRankingEntry(entry: RankingEntryDisplay | undefined | null): boolean {
  return !entry || !entry.name?.trim() || entry.name === 'Untitled';
}

export function entityDiffToRankingEntry(entity: EntityDiff): RankingEntryDisplay {
  const valueAfter = (propertyId: string) =>
    entity.values.find(value => ID.equals(value.propertyId, propertyId))?.after;
  const description = valueAfter(SystemIds.DESCRIPTION_PROPERTY);
  // Raw (un-post-processed) diffs carry no resolved name; read it from the NAME value.
  const name = entity.name?.trim() || valueAfter(SystemIds.NAME_PROPERTY)?.trim();

  return {
    entityId: entity.entityId,
    name: name || 'Untitled',
    description: description?.trim() || null,
    image: null,
    spaceId: null,
  };
}

export function getPendingProposerSpaceIds(
  submitterSpaceIds: Iterable<string>,
  extra: Iterable<string> = []
): string[] {
  const proposers = new Set<string>();
  for (const id of submitterSpaceIds) {
    if (id) proposers.add(id);
  }
  for (const id of extra) {
    if (id) proposers.add(id);
  }
  return [...proposers];
}

/** Upper bound on proposers scanned for pending names; each costs up to 2 requests per page. */
export const MAX_PENDING_PROPOSERS = 10;

export type RankingBlockPendingSelectionInput = {
  /** Every id in the viewer's own ranking (pending badge applies even to named rows). */
  ownRankingEntityIds: readonly string[];
  /** Rendered my-ranking rows the indexer couldn't name. */
  unresolvedMyRankingEntityIds: readonly string[];
  /** The viewer's own ranking shown on someone else's shared ranking. */
  viewerOwnEntityIds: readonly string[];
  /** Rendered viewer-own rows the indexer couldn't name. */
  unresolvedViewerOwnEntityIds: readonly string[];
  /** Everyone who submitted to this ranking. */
  submitterSpaceIds: Iterable<string>;
  /** The viewer and shared-ranking author; kept ahead of submitters when capping. */
  priorityProposerSpaceIds: Iterable<string | null | undefined>;
};

export type RankingBlockPendingSelection = {
  candidateEntityIds: string[];
  proposerSpaceIds: string[];
};

/**
 * Picks which entities and proposers the embedded ranking block searches for
 * pending names. Only rows the block renders are candidates: global
 * placeholders are hidden from the leaderboard, so resolving them is wasted work.
 */
export function selectRankingBlockPendingCandidates({
  ownRankingEntityIds,
  unresolvedMyRankingEntityIds,
  viewerOwnEntityIds,
  unresolvedViewerOwnEntityIds,
  submitterSpaceIds,
  priorityProposerSpaceIds,
}: RankingBlockPendingSelectionInput): RankingBlockPendingSelection {
  const candidates = new Set<string>();
  for (const ids of [ownRankingEntityIds, unresolvedMyRankingEntityIds, viewerOwnEntityIds]) {
    for (const id of ids) if (id) candidates.add(id);
  }
  if (candidates.size === 0) return { candidateEntityIds: [], proposerSpaceIds: [] };

  // Other submitters only matter for rendered rows that still lack a name.
  const needsSubmitters = unresolvedMyRankingEntityIds.length > 0 || unresolvedViewerOwnEntityIds.length > 0;
  const priority = [...priorityProposerSpaceIds].filter((id): id is string => Boolean(id));
  const proposers = getPendingProposerSpaceIds(priority, needsSubmitters ? submitterSpaceIds : []);

  return {
    candidateEntityIds: [...candidates],
    proposerSpaceIds: proposers.slice(0, MAX_PENDING_PROPOSERS),
  };
}
