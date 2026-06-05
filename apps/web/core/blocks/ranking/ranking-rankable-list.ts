/**
 * Ranking entity lists (compose pick list, global tab) combine two sources:
 *
 * 1. **fetchAggregatedRankings** — global leaderboard order (ranked entity ids).
 * 2. **entitiesConnection** — block filter query (paginated rows via `useDataBlock`).
 *
 * We do not plan to use `fetchRankableEntities` or `fetchIndividualRanking`. Filter matches
 * always come from `entitiesConnection` with the block’s filters. Merge aggregated ids with
 * connection results and dedupe (`splitRankableEntityIds`): ranked first, then unranked matches.
 *
 * My-ranking ballots stay local / `createRank` until indexer APIs ship; individual fetch is TBD.
 */
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { Row } from '~/core/types';

export function getRowDisplayName(row: Row): string {
  return row.columns[SystemIds.NAME_PROPERTY]?.name?.trim() || 'Untitled';
}

export function getRowDescription(row: Row): string | null {
  const cell = row.columns[SystemIds.DESCRIPTION_PROPERTY];
  const text = cell?.name?.trim() ?? cell?.description?.trim();
  return text || null;
}

export type RankableEntitySections = {
  /** Globally ranked entities in leaderboard order (each id once). */
  rankedEntityIds: string[];
  /** Filter matches not on the global leaderboard, sorted by name (each id once). */
  unrankedEntityIds: string[];
};

/**
 * Splits rankable entities for the compose pick list.
 * Ranked first (global order), then unranked filter matches — no duplicate ids.
 *
 * `globalOrderedIds` from fetchAggregatedRankings (or interim client aggregate).
 * `filterRows` from entitiesConnection — ranked ids first, then filter-only matches, deduped.
 */
export function splitRankableEntityIds(globalOrderedIds: string[], filterRows: Row[]): RankableEntitySections {
  const seen = new Set<string>();
  const rankedEntityIds: string[] = [];

  for (const id of globalOrderedIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rankedEntityIds.push(id);
  }

  const unrankedEntityIds = filterRows
    .filter(row => !row.placeholder && row.entityId && !seen.has(row.entityId))
    .map(row => ({ entityId: row.entityId, name: getRowDisplayName(row) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map(({ entityId }) => entityId);

  return { rankedEntityIds, unrankedEntityIds };
}

/**
 * Flat ordered list (ranked then unranked). Prefer `splitRankableEntityIds` in compose UI.
 */
export function buildRankableEntityOrder(globalOrderedIds: string[], filterRows: Row[]): string[] {
  const { rankedEntityIds, unrankedEntityIds } = splitRankableEntityIds(globalOrderedIds, filterRows);
  return [...rankedEntityIds, ...unrankedEntityIds];
}
