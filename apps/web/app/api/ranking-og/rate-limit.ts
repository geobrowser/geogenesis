import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type RankingOgRateLimitResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Resolve Redis the way chat/newsletter/places do: `fromEnv()`, not an `UPSTASH_*` name check.
 * Vercel provisions `KV_REST_API_*`, which `fromEnv()` also accepts — the old gate treated that as
 * "unconfigured", left the limiters null, and never rate-limited in production (fail-open hid it).
 * One retry here; unconfigured/outage still fails open in `check()`.
 */
const redis = Redis.fromEnv({ retry: { retries: 1 } });

export const walletLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(300, '1 h'),
  analytics: true,
  prefix: 'ranking-og:wallet',
});

export const ipLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, '1 h'),
  analytics: true,
  prefix: 'ranking-og:ip',
});

async function check(limiter: Ratelimit, identifier: string): Promise<RankingOgRateLimitResult> {
  try {
    const result = await limiter.limit(identifier);
    if (result.success) return { ok: true };
    return { ok: false, retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
  } catch (error) {
    // Non-critical surface: fail open so a Redis outage can't block publishing. This is also the
    // path an unconfigured machine takes, which is why construction above needs no env gate.
    console.error('[ranking-og/rate-limit] unavailable', error);
    return { ok: true };
  }
}

export const checkRankingOgWalletRateLimit = (wallet: string) => check(walletLimiter, wallet);

export const checkRankingOgIpRateLimit = (ip: string) => check(ipLimiter, ip);

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
