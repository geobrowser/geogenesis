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
  const description = entity.values.find(value => ID.equals(value.propertyId, SystemIds.DESCRIPTION_PROPERTY))?.after;

  return {
    entityId: entity.entityId,
    name: entity.name?.trim() || 'Untitled',
    description: description?.trim() || null,
    image: null,
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
