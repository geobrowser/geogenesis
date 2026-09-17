import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Loads the limiters with exactly the environment named — nothing inherited from the host process,
 * so the result is the same on a laptop with Upstash credentials and on one without.
 *
 * Re-imported per case because the module reads its configuration once, at import.
 */
async function loadLimiters(env: Record<string, string>) {
  vi.resetModules();
  for (const name of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
    vi.stubEnv(name, env[name] ?? '');
  }
  return import('./rate-limit');
}

afterEach(() => vi.unstubAllEnvs());

// The bug this file shipped with. The limiters used to be built only when `UPSTASH_REDIS_REST_*`
// were set, which reads as "not configured" on a deploy carrying Vercel's `KV_REST_API_*` pair
// instead — and `Redis.fromEnv()` accepts both. Chat's limiters worked on the very deployment where
// these returned null and the route refused every request.
//
// Nothing here may depend on which pair is present: the client resolves its own configuration, and
// whether a limiter is usable is answered by calling it.
describe('newsletter rate limiters', () => {
  it('exist under the UPSTASH_* naming', async () => {
    const { emailLimit, ipLimit } = await loadLimiters({
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    });

    expect(typeof emailLimit.limit).toBe('function');
    expect(typeof ipLimit.limit).toBe('function');
  });

  // The regression. This is the shape Vercel's own Upstash integration provisions, and the one the
  // previous check could not see.
  it('exist under the KV_REST_API_* naming, which Vercel provisions', async () => {
    const { emailLimit, ipLimit } = await loadLimiters({
      KV_REST_API_URL: 'https://example.upstash.io',
      KV_REST_API_TOKEN: 'token',
    });

    expect(typeof emailLimit.limit).toBe('function');
    expect(typeof ipLimit.limit).toBe('function');
  });

  // Even with nothing configured the limiters are real objects rather than `null`. The route is
  // built to learn that Redis is unusable by calling it, which it cannot do against a null.
  it('exist even when neither naming is present', async () => {
    const { emailLimit, ipLimit } = await loadLimiters({});

    expect(typeof emailLimit.limit).toBe('function');
    expect(typeof ipLimit.limit).toBe('function');
  });
});
