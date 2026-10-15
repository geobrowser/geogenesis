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

// The bug this file shipped with, and the same one `newsletter/rate-limit.ts` documents. The
// limiters used to be built only when `UPSTASH_REDIS_REST_*` were set, which reads as "not
// configured" on a deploy carrying Vercel's `KV_REST_API_*` pair instead — and `Redis.fromEnv()`
// accepts both. Both limiters stayed null and every request was allowed, silently, because this
// module fails open by design.
//
// Nothing here may depend on which pair is present: the client resolves its own configuration, and
// whether a limiter is usable is answered by calling it.
describe('ranking-og rate limiters', () => {
  it('exist under the UPSTASH_* naming', async () => {
    const { walletLimiter, ipLimiter } = await loadLimiters({
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    });

    expect(typeof walletLimiter.limit).toBe('function');
    expect(typeof ipLimiter.limit).toBe('function');
  });

  // The regression. This is the shape Vercel's own Upstash integration provisions, and the one the
  // previous check could not see.
  it('exist under the KV_REST_API_* naming, which Vercel provisions', async () => {
    const { walletLimiter, ipLimiter } = await loadLimiters({
      KV_REST_API_URL: 'https://example.upstash.io',
      KV_REST_API_TOKEN: 'token',
    });

    expect(typeof walletLimiter.limit).toBe('function');
    expect(typeof ipLimiter.limit).toBe('function');
  });

  // Even with nothing configured the limiters are real objects rather than `null`. The module is
  // built to learn that Redis is unusable by calling it, which it cannot do against a null.
  it('exist even when neither naming is present', async () => {
    const { walletLimiter, ipLimiter } = await loadLimiters({});

    expect(typeof walletLimiter.limit).toBe('function');
    expect(typeof ipLimiter.limit).toBe('function');
  });

  // The property the old env gate was protecting: an unconfigured machine must fail open promptly
  // rather than sit through the package's default ~4.4s of retries on an on-demand render path.
  it('fails open promptly when nothing is configured', async () => {
    const { checkRankingOgIpRateLimit } = await loadLimiters({});

    const started = Date.now();
    await expect(checkRankingOgIpRateLimit('1.2.3.4')).resolves.toEqual({ ok: true });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
