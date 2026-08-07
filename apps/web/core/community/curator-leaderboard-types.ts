export type CuratorLeaderboardPeriod = 'week' | 'month' | 'year' | 'all';

export const CURATOR_LEADERBOARD_PERIOD_OPTIONS: { value: CuratorLeaderboardPeriod; label: string }[] = [
  { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Last month' },
  { value: 'year', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

/** Rows the table shows before it truncates. Beyond this the viewer's own row is appended. */
export const CURATOR_LEADERBOARD_MAX_ROWS = 5;

export type CuratorLeaderboardMetrics = {
  activeCurators: number;
  rankings: number;
  newsStories: number;
};

export type CuratorLeaderboardRow = {
  curatorSpaceId: string;
  name: string;
  avatarUrl: string | null;
  rankings: number;
  newsStories: number;
  votes: number;
  submissions: number;
  activityScore: number;
  rank: number;
  isCurrentUser: boolean;
};

export type CuratorLeaderboardResult = {
  period: CuratorLeaderboardPeriod;
  metrics: CuratorLeaderboardMetrics;
  rows: CuratorLeaderboardRow[];
  currentUserRow: CuratorLeaderboardRow | null;
};
