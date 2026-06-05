import type { Row } from '~/core/types';

/** How many filtered entities to show on Global tab before aggregated submissions exist. */
export const RANKING_SAMPLE_GLOBAL_ENTRY_LIMIT = 3;

/** How many filtered entities to show on My ranking before the user submits a ballot. */
export const RANKING_SAMPLE_MY_ENTRY_LIMIT = 5;

function sampleEntityIdsFromFilterRows(rows: Row[], limit: number): string[] {
  return rows
    .filter(row => !row.placeholder && row.entityId)
    .slice(0, limit)
    .map(row => row.entityId);
}

/**
 * Placeholder global list from the ranking block’s filtered rows (design preview).
 *
 * TODO(ranking-api): Remove when fetchAggregatedRankings replaces interim client aggregate.
 * TODO(competition-points): Remove sample when competition-linked global order ships.
 */
export function getSampleGlobalRankingEntityIds(rows: Row[]): string[] {
  return sampleEntityIdsFromFilterRows(rows, RANKING_SAMPLE_GLOBAL_ENTRY_LIMIT);
}

/**
 * Placeholder my-ranking list from the data block `entitiesConnection` query.
 *
 * TODO(ranking-api): Remove when the user’s ballot is loaded from createRank / indexer (not fetchIndividualRanking).
 */
export function getSampleMyRankingEntityIds(rows: Row[]): string[] {
  return sampleEntityIdsFromFilterRows(rows, RANKING_SAMPLE_MY_ENTRY_LIMIT);
}
