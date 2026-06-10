/**
 * My-ranking ballots are published via `createRank` / `updateRank` in the user's personal space.
 */
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Row } from '~/core/types';

function normalizedEntityId(id: string): string {
  return ID.uuidToHex(id);
}

export function getRowDisplayName(row: Row): string {
  return row.columns[SystemIds.NAME_PROPERTY]?.name?.trim() || 'Untitled';
}

export function getRowDescription(row: Row): string | null {
  const cell = row.columns[SystemIds.DESCRIPTION_PROPERTY];
  const text = cell?.name?.trim() ?? cell?.description?.trim();
  return text || null;
}

export type RankableEntitySections = {
  rankedEntityIds: string[];
  unrankedEntityIds: string[];
};

export function splitRankableEntityIds(globalOrderedIds: string[], filterRows: Row[]): RankableEntitySections {
  const seen = new Set<string>();
  const rankedEntityIds: string[] = [];

  for (const id of globalOrderedIds) {
    if (!id) continue;
    const key = normalizedEntityId(id);
    if (seen.has(key)) continue;
    seen.add(key);
    rankedEntityIds.push(id);
  }

  const unrankedCandidates: { entityId: string; name: string }[] = [];
  const unrankedSeen = new Set<string>();

  for (const row of filterRows) {
    if (row.placeholder || !row.entityId) continue;
    const key = normalizedEntityId(row.entityId);
    if (seen.has(key) || unrankedSeen.has(key)) continue;
    unrankedSeen.add(key);
    unrankedCandidates.push({ entityId: row.entityId, name: getRowDisplayName(row) });
  }

  const unrankedEntityIds = unrankedCandidates
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map(({ entityId }) => entityId);

  return { rankedEntityIds, unrankedEntityIds };
}
