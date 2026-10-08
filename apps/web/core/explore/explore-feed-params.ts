import type { ExploreSort, ExploreTime } from './fetch-explore-feed';

/**
 * Explore's own sorts: the shared ones plus For you (GEO-3083). Kept apart from `ExploreSort` so
 * the Topic feeds and `fetchExploreFeed`, which only rank by Best, Top or New, cannot receive it.
 */
export type ExplorePageSort = ExploreSort | 'for-you';

const EXPLORE_SORTS: readonly ExploreSort[] = ['best', 'new', 'top'];
const EXPLORE_PAGE_SORTS: readonly ExplorePageSort[] = [...EXPLORE_SORTS, 'for-you'];
const EXPLORE_TIMES: readonly ExploreTime[] = ['today', 'week', 'month', 'year', 'all'];

export function parseExploreSort(raw: string | null, fallback: ExploreSort = 'best'): ExploreSort {
  return raw && (EXPLORE_SORTS as readonly string[]).includes(raw) ? (raw as ExploreSort) : fallback;
}

/** For the Explore route only; every other feed route uses {@link parseExploreSort}. */
export function parseExplorePageSort(raw: string | null, fallback: ExplorePageSort = 'best'): ExplorePageSort {
  return raw && (EXPLORE_PAGE_SORTS as readonly string[]).includes(raw) ? (raw as ExplorePageSort) : fallback;
}

/** Missing or invalid means no time filter, never a hidden range the viewer did not select. */
export function parseExploreTime(raw: string | null): ExploreTime {
  return raw && (EXPLORE_TIMES as readonly string[]).includes(raw) ? (raw as ExploreTime) : 'all';
}
