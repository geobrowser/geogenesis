import { Redis } from '@upstash/redis';

/**
 * One acceptor signing at a time, across the two publish sweeps.
 *
 * Both sweeps sign with the same smart account. Two runs submitting user operations at once read
 * the same account nonce, and one of them fails — and for the full debate publish a failure between
 * proposing and voting leaves a proposal pending with no Debate entity, so the next tick proposes
 * the whole debate again. Until the early claims sweep (GEO-2870) there was one sweep on a
 * five-minute schedule that stopped starting work at three minutes, so runs never overlapped; a
 * per-minute sweep beside it overlaps it routinely.
 *
 * Upstash, because that is the store this app already has. Fails open — runs without the lock — when
 * it is not configured or does not answer, which is exactly today's behaviour, and says so.
 */

const LOCK_KEY = 'debate-acceptor:signing-lock';
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export type AcceptorLockStore = {
  /** SET NX PX: true when acquired. */
  acquire: (token: string, ttlMs: number) => Promise<boolean>;
  /** Delete the lock only if it still holds `token`. */
  release: (token: string) => Promise<void>;
};

function upstashStore(): AcceptorLockStore | null {
  // Either name pair: the app has had Upstash configured under both (see app/api/newsletter).
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token, retry: { retries: 1 } });
  return {
    acquire: async (value, ttlMs) => (await redis.set(LOCK_KEY, value, { nx: true, px: ttlMs })) === 'OK',
    release: async value => {
      await redis.eval(RELEASE_SCRIPT, [LOCK_KEY], [value]);
    },
  };
}

export type AcceptorLockOutcome<T> = { ran: true; value: T } | { ran: false };

/**
 * Run `fn` holding the acceptor signing lock. Waits up to `waitMs` for a run in progress to finish
 * (polling every `pollMs`), then gives up and returns `{ ran: false }` without running `fn`.
 * `ttlMs` bounds a lock whose holder died without releasing it; set it to the route's maxDuration.
 */
export async function withAcceptorLock<T>(
  fn: () => Promise<T>,
  {
    ttlMs,
    waitMs = 0,
    pollMs = 2_000,
    store = upstashStore(),
    sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  }: {
    ttlMs: number;
    waitMs?: number;
    pollMs?: number;
    store?: AcceptorLockStore | null;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<AcceptorLockOutcome<T>> {
  if (!store) {
    console.warn('[debate-acceptor] no Upstash configured; publishing without the signing lock');
    return { ran: true, value: await fn() };
  }

  const token = crypto.randomUUID();
  let acquired = false;
  try {
    const deadline = Date.now() + waitMs;
    acquired = await store.acquire(token, ttlMs);
    while (!acquired && Date.now() < deadline) {
      await sleep(pollMs);
      acquired = await store.acquire(token, ttlMs);
    }
  } catch (error) {
    console.warn('[debate-acceptor] signing lock unavailable; publishing without it', error);
    return { ran: true, value: await fn() };
  }
  if (!acquired) return { ran: false };

  try {
    return { ran: true, value: await fn() };
  } finally {
    // Best effort: an unreleased lock expires after `ttlMs`.
    await store.release(token).catch(error => {
      console.warn('[debate-acceptor] could not release the signing lock', error);
    });
  }
}
