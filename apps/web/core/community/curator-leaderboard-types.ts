export type CuratorLeaderboardPeriod = 'week' | 'month' | 'year' | 'all';

export const CURATOR_LEADERBOARD_PERIOD_OPTIONS: { value: CuratorLeaderboardPeriod; label: string }[] = [
  { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Last month' },
  { value: 'year', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

const CURATOR_LEADERBOARD_PERIODS = new Set<CuratorLeaderboardPeriod>(
  CURATOR_LEADERBOARD_PERIOD_OPTIONS.map(option => option.value)
);

export function parseCuratorLeaderboardPeriod(value: string | null | undefined): CuratorLeaderboardPeriod {
  return CURATOR_LEADERBOARD_PERIODS.has(value as CuratorLeaderboardPeriod)
    ? (value as CuratorLeaderboardPeriod)
    : 'week';
}

export const CURATOR_LEADERBOARD_PAGE_SIZE = 5;

export type CuratorLeaderboardMetrics = {
  activeCurators: number;
  rankings: number;
  newsStories: number;
  debates: number;
};

export type CuratorLeaderboardRow = {
  curatorSpaceId: string;
  name: string;
  avatarUrl: string | null;
  rankings: number;
  newsStories: number;
  votes: number;
  submissions: number;
  debates: number;
  activityScore: number;
  rank: number;
  isCurrentUser: boolean;
};

export type CuratorLeaderboardResult = {
  period: CuratorLeaderboardPeriod;
  metrics: CuratorLeaderboardMetrics;
  rows: CuratorLeaderboardRow[];
  currentUserRow: CuratorLeaderboardRow | null;
  truncated: boolean;
};
