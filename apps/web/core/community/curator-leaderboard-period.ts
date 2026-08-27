import type { CuratorLeaderboardPeriod } from './curator-leaderboard-types';

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_DAYS: Record<Exclude<CuratorLeaderboardPeriod, 'all'>, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export type CuratorLeaderboardWindow = {
  seconds: number | null;
  iso: string | null;
};

export function curatorLeaderboardWindow(period: CuratorLeaderboardPeriod, now = Date.now()): CuratorLeaderboardWindow {
  if (period === 'all') {
    return { seconds: null, iso: null };
  }

  const startMs = now - PERIOD_DAYS[period] * DAY_MS;

  return {
    seconds: Math.floor(startMs / 1000),
    iso: new Date(startMs).toISOString(),
  };
}

export function toUnixSeconds(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : Math.floor(raw);
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    return asNumber > 1_000_000_000_000 ? Math.floor(asNumber / 1000) : Math.floor(asNumber);
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

export function isWithinWindow(raw: string | number | null | undefined, window: CuratorLeaderboardWindow): boolean {
  if (window.seconds === null) return true;

  const seconds = toUnixSeconds(raw);
  if (seconds === null) return false;

  return seconds >= window.seconds;
}
