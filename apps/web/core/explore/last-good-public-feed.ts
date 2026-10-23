import { upstashRedis } from './fresh-slot/shared-fresh-list';

/**
 * The last good public first page of Best, kept so the feed route has something to serve when gaia
 * cannot build a page in time. On 2026-10-16 gaia shed or timed out the feed's queries in clusters
 * (503 "database pressure", 504 upstream timeout), and with the client's retries the reader sat on
 * a spinner for 60–106s before being told nothing. A page a few minutes old is a far better answer.
 *
 * Only the public page, because it is the one page identical for every reader: nothing per-visitor
 * is in it, so handing it to anyone else leaks nothing. Each instance holds its own copy and also
 * shares it through Upstash, so a cold instance — every instance after a deploy — still has one.
 *
 * Best-effort both ways: no Upstash, a slow answer, an unreadable record or an error all read as
 * "nothing kept", and the caller answers as it would have without it.
 */

/** Long enough for a sound Upstash read; past it the reader has waited long enough. */
export const LAST_GOOD_PUBLIC_FEED_READ_TIMEOUT_MS = 300;

/** A day old still beats an error page; the feed is ranked, not a live log. */
const LAST_GOOD_PUBLIC_FEED_TTL_MS = 24 * 60 * 60 * 1000;

/** One shared write per instance per minute is plenty: the page changes slowly. */
const SHARED_WRITE_INTERVAL_MS = 60 * 1000;

/** Upstash rejects a request over 1MB; a page that large is skipped rather than truncated. */
const MAX_SHARED_PAGE_BYTES = 900_000;

const KEY = 'explore:feed:last-good-public';

export type LastGoodPublicFeed<Body> = { asOfMs: number; body: Body };

export type LastGoodPublicFeedStore = {
  read: (key: string) => Promise<unknown>;
  write: (key: string, value: string, ttlMs: number) => Promise<void>;
};

let store: LastGoodPublicFeedStore | null | undefined;
let held: LastGoodPublicFeed<unknown> | null = null;
let lastSharedWriteMs = 0;

function sharedStore(): LastGoodPublicFeedStore | null {
  if (store !== undefined) return store;
  const redis = upstashRedis();
  store = redis
    ? {
        read: key => redis.get(key),
        write: async (key, value, ttlMs) => {
          await redis.set(key, value, { px: ttlMs });
        },
      }
    : null;
  return store;
}

export function resetLastGoodPublicFeedForTests(next: LastGoodPublicFeedStore | null) {
  store = next;
  held = null;
  lastSharedWriteMs = 0;
}

/** The Upstash client parses JSON values itself; a test store may hand back the string. */
function decode<Body>(value: unknown): LastGoodPublicFeed<Body> | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as { asOfMs?: unknown; body?: unknown };
  const body = record.body as { items?: unknown } | null | undefined;
  if (typeof record.asOfMs !== 'number' || !Number.isFinite(record.asOfMs)) return null;
  if (Date.now() - record.asOfMs > LAST_GOOD_PUBLIC_FEED_TTL_MS) return null;
  if (!body || typeof body !== 'object' || !Array.isArray(body.items) || body.items.length === 0) return null;
  return { asOfMs: record.asOfMs, body: body as Body };
}

/**
 * Keeps `body` as the last good public page. Held at once; shared at most once a minute per
 * instance, and only awaited by a caller that wants to (the route runs it after its response).
 */
export async function rememberPublicFeedPage<Body>(body: Body): Promise<void> {
  const now = Date.now();
  held = { asOfMs: now, body };
  const current = sharedStore();
  if (!current || now - lastSharedWriteMs < SHARED_WRITE_INTERVAL_MS) return;
  lastSharedWriteMs = now;
  const value = JSON.stringify(held);
  if (value.length > MAX_SHARED_PAGE_BYTES) {
    console.warn(`explore feed: last good page not shared, ${value.length} bytes is over the limit`);
    return;
  }
  try {
    await current.write(KEY, value, LAST_GOOD_PUBLIC_FEED_TTL_MS);
  } catch (error) {
    console.error('explore feed: last good page write failed', error);
  }
}

/** This instance's copy if it has one, else the shared one, else null. */
export async function readLastGoodPublicFeed<Body>(): Promise<LastGoodPublicFeed<Body> | null> {
  const local = decode<Body>(held);
  if (local) return local;
  const current = sharedStore();
  if (!current) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      current.read(KEY),
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), LAST_GOOD_PUBLIC_FEED_READ_TIMEOUT_MS);
      }),
    ]);
    return decode<Body>(value);
  } catch (error) {
    console.error('explore feed: last good page read failed', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
