export type ExploreTime = 'today' | 'week' | 'month' | 'year' | 'all';

export const EXPLORE_TIME_OPTIONS: readonly { value: ExploreTime; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'Last month' },
  { value: 'year', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

export function exploreTimeThresholdSec(filter: ExploreTime, nowMs = Date.now()): number | null {
  const now = Math.floor(nowMs / 1000);
  switch (filter) {
    case 'today':
      return now - 86400;
    case 'week':
      return now - 7 * 86400;
    case 'month':
      return now - 30 * 86400;
    case 'year':
      return now - 365 * 86400;
    case 'all':
    default:
      return null;
  }
}
