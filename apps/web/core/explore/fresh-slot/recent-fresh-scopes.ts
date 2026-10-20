import { upstashRedis } from './shared-fresh-list';

/**
 * GEO-3308. The scopes readers recently asked a Fresh list for, so the cron can keep them warm.
 * A scope is its inputs only: the space ids, type ids, time and hours. Never a wallet or anything
 * that names a reader beyond the set of spaces their feed spans.
 *
 * One Upstash sorted set, scored by last-seen time. Best-effort both ways: no Upstash or any error
 * reads as "nothing recorded", and the request path is never slowed or failed by it.
 */

export type RecentFreshScope = {
  spaceIds: string[];
  typeIds: string[];
  time: 'today' | 'week' | 'month' | 'year' | 'all';
  requireName: boolean | null;
  requireDebateTagOnClaims: boolean | null;
  freshnessHours: number;
};

export type RecentFreshScopeStore = {
  add: (member: string, scoreMs: number) => Promise<void>;
  /** Members scored at or after `minScoreMs`, newest first, at most `limit`. */
  newest: (minScoreMs: number, limit: number) => Promise<string[]>;
  /** Drops members scored before `minScoreMs`, then keeps only the `keep` newest. */
  trim: (minScoreMs: number, keep: number) => Promise<void>;
};

const SET_KEY = 'explore:fresh-list:recent-scopes';
/** The set never holds more than this, however many distinct scopes readers produce. */
export const RECENT_SCOPES_MAX_MEMBERS = 100;
/** A scope with a very long space list is skipped rather than stored. */
const MAX_MEMBER_CHARS = 20_000;

let store: RecentFreshScopeStore | null | undefined;

function upstashStore(): RecentFreshScopeStore | null {
  const redis = upstashRedis();
  if (!redis) return null;
  return {
    add: async (member, scoreMs) => {
      await redis.zadd(SET_KEY, { score: scoreMs, member });
    },
    newest: async (minScoreMs, limit) => {
      const rows = await redis.zrange<string[]>(SET_KEY, '+inf', minScoreMs, {
        byScore: true,
        rev: true,
        offset: 0,
        count: limit,
      });
      return rows.map(row => (typeof row === 'string' ? row : JSON.stringify(row)));
    },
    trim: async (minScoreMs, keep) => {
      await redis.zremrangebyscore(SET_KEY, '-inf', `(${minScoreMs}`);
      await redis.zremrangebyrank(SET_KEY, 0, -(keep + 1));
    },
  };
}

function sharedStore() {
  if (store === undefined) store = upstashStore();
  return store;
}

export function setRecentFreshScopeStoreForTests(next: RecentFreshScopeStore | null) {
  store = next;
}

/** Throws on a store error; the caller fails open. */
export async function recordRecentFreshScope(scope: RecentFreshScope, nowMs: number) {
  const current = sharedStore();
  if (!current) return;
  const member = JSON.stringify(scope);
  if (member.length > MAX_MEMBER_CHARS) return;
  await current.add(member, nowMs);
}

function parse(member: string): RecentFreshScope | null {
  try {
    const value = JSON.parse(member) as Partial<RecentFreshScope>;
    const strings = (list: unknown): list is string[] =>
      Array.isArray(list) && list.every(item => typeof item === 'string');
    if (!strings(value.spaceIds) || value.spaceIds.length === 0 || !strings(value.typeIds)) return null;
    if (!['today', 'week', 'month', 'year', 'all'].includes(value.time as string)) return null;
    if (typeof value.freshnessHours !== 'number' || !Number.isFinite(value.freshnessHours)) return null;
    return {
      spaceIds: value.spaceIds,
      typeIds: value.typeIds,
      time: value.time as RecentFreshScope['time'],
      requireName: typeof value.requireName === 'boolean' ? value.requireName : null,
      requireDebateTagOnClaims:
        typeof value.requireDebateTagOnClaims === 'boolean' ? value.requireDebateTagOnClaims : null,
      freshnessHours: value.freshnessHours,
    };
  } catch {
    return null;
  }
}

/**
 * Trims entries older than `windowMs` (and any beyond the member cap), then returns up to `limit`
 * of the newest scopes seen within the window. Unreadable members are skipped.
 */
export async function readRecentFreshScopes(args: {
  nowMs: number;
  windowMs: number;
  limit: number;
}): Promise<RecentFreshScope[]> {
  const current = sharedStore();
  if (!current) return [];
  const minScoreMs = args.nowMs - args.windowMs;
  try {
    await current.trim(minScoreMs, RECENT_SCOPES_MAX_MEMBERS);
  } catch (error) {
    console.warn('explore fresh slot: trimming the recent scopes failed', error);
  }
  try {
    const members = await current.newest(minScoreMs, args.limit);
    return members.flatMap(member => {
      const scope = parse(member);
      return scope ? [scope] : [];
    });
  } catch (error) {
    console.warn('explore fresh slot: reading the recent scopes failed', error);
    return [];
  }
}
