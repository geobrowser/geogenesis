import type { ExploreSort, ExploreTime } from './fetch-explore-feed';

const EXPLORE_SORTS: readonly ExploreSort[] = ['best', 'new', 'top'];
const EXPLORE_TIMES: readonly ExploreTime[] = ['today', 'week', 'month', 'year', 'all'];

export function parseExploreSort(raw: string | null, fallback: ExploreSort = 'best'): ExploreSort {
  return raw && (EXPLORE_SORTS as readonly string[]).includes(raw) ? (raw as ExploreSort) : fallback;
}

/** Missing or invalid means no time filter, never a hidden range the viewer did not select. */
export function parseExploreTime(raw: string | null): ExploreTime {
  return raw && (EXPLORE_TIMES as readonly string[]).includes(raw) ? (raw as ExploreTime) : 'all';
}
