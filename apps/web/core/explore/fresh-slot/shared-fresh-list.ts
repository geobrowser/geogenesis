import { Redis } from '@upstash/redis';

import { createHash } from 'node:crypto';

/**
 * GEO-3279. The newest Fresh list per scope, shared between server instances through this app's
 * Upstash Redis. Each instance also holds its own copy, but a cold instance — and after a deploy
 * every instance is cold — has nothing, and building a list is a ~4s gaia query (GEO-3308). With
 * this, only the instance that refreshes a list pays for it, behind its response.
 *
 * Best-effort both ways: no Upstash, a slow answer, an unreadable record or an error all read as
 * "nothing shared", and the caller queries gaia as it would have without it.
 */

/** Long enough for a sound Upstash read; past it, querying gaia is no slower than waiting on. */
export const SHARED_FRESH_LIST_READ_TIMEOUT_MS = 300;

/** Upstash rejects a request over 1MB; a list that large is skipped rather than truncated. */
const MAX_SHARED_FRESH_LIST_BYTES = 900_000;

export type SharedFreshList<Page> = { asOfMs: number; page: Page };

export type SharedFreshListStore = {
  read: (key: string) => Promise<unknown>;
  write: (key: string, value: string, ttlMs: number) => Promise<void>;
};

let store: SharedFreshListStore | null | undefined;

/** The Upstash client, or null when Upstash is not configured. */
export function upstashRedis(): Redis | null {
  // Either name pair, as the acceptor lock reads them: the app has had Upstash under both.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, retry: { retries: 0 } });
}

/** The Upstash-backed store, or null when Upstash is not configured. */
function upstashSharedFreshListStore(): SharedFreshListStore | null {
  const redis = upstashRedis();
  if (!redis) return null;
  return {
    read: key => redis.get(key),
    write: async (key, value, ttlMs) => {
      await redis.set(key, value, { px: ttlMs });
    },
  };
}

function sharedStore(): SharedFreshListStore | null {
  if (store === undefined) store = upstashSharedFreshListStore();
  return store;
}

export function setSharedFreshListStoreForTests(next: SharedFreshListStore | null) {
  store = next;
}

function keyOf(scopeKey: string) {
  return `explore:fresh-list:latest:${createHash('sha256').update(scopeKey).digest('hex')}`;
}

/** The Upstash client parses JSON values itself; a test store may hand back the string. */
function decode<Page>(value: unknown): SharedFreshList<Page> | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as { asOfMs?: unknown; page?: unknown };
  const page = record.page as { entities?: unknown } | null | undefined;
  if (typeof record.asOfMs !== 'number' || !Number.isFinite(record.asOfMs)) return null;
  if (!page || typeof page !== 'object' || !Array.isArray(page.entities)) return null;
  return { asOfMs: record.asOfMs, page: page as Page };
}

/** The shared list for `scopeKey`, or null when there is none or it could not be read in time. */
export async function readSharedFreshList<Page>(scopeKey: string): Promise<SharedFreshList<Page> | null> {
  const current = sharedStore();
  if (!current) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      current.read(keyOf(scopeKey)),
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), SHARED_FRESH_LIST_READ_TIMEOUT_MS);
      }),
    ]);
    return decode<Page>(value);
  } catch (error) {
    console.error('explore fresh slot: shared Fresh list read failed', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shares `list` as the newest for `scopeKey`, kept for `ttlMs`. Last writer wins: the callers only
 * write lists pinned to their own present, so two racing writers differ by a minute at most.
 */
export async function writeSharedFreshList<Page>(scopeKey: string, list: SharedFreshList<Page>, ttlMs: number) {
  const current = sharedStore();
  if (!current) return;
  const value = JSON.stringify(list);
  if (value.length > MAX_SHARED_FRESH_LIST_BYTES) {
    console.warn(`explore fresh slot: Fresh list not shared, ${value.length} bytes is over the limit`);
    return;
  }
  try {
    await current.write(keyOf(scopeKey), value, ttlMs);
  } catch (error) {
    console.error('explore fresh slot: shared Fresh list write failed', error);
  }
}
