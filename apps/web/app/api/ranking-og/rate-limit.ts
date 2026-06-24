import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type RankingOgRateLimitResult = { ok: true } | { ok: false; retryAfter: number };

// Upstash is optional for ranking OG routes (e.g. local dev has no Redis env).
// Construct lazily and fail open so OG generation/preview never hard-crash when
// rate limiting is unavailable — OG images are non-critical.
let walletLimiter: Ratelimit | null = null;
let ipLimiter: Ratelimit | null = null;

// `Redis.fromEnv()` does NOT throw when the env vars are missing — it returns a
// client with no url/token that only fails (after retrying ~4.4s) once a command
// runs. So gate on the env explicitly: when Upstash isn't configured, leave the
// limiters null and fail open instantly instead of paying retry/backoff on every
// request (the on-demand OG render path a social crawler hits).
const hasUpstashEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

if (hasUpstashEnv) {
  try {
    // Bound retries so a transient Upstash outage can't hang OG requests for
    // seconds — OG rate limiting is non-critical and fails open anyway.
    const redis = Redis.fromEnv({ retry: { retries: 1 } });
    walletLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(300, '1 h'),
      analytics: true,
      prefix: 'ranking-og:wallet',
    });
    ipLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, '1 h'),
      analytics: true,
      prefix: 'ranking-og:ip',
    });
  } catch {
    // Construction failed despite env present — rate limiting disabled (allow).
  }
}

async function check(limiter: Ratelimit | null, identifier: string): Promise<RankingOgRateLimitResult> {
  if (!limiter) return { ok: true };
  try {
    const result = await limiter.limit(identifier);
    if (result.success) return { ok: true };
    return { ok: false, retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
  } catch (error) {
    // Non-critical surface: fail open so a Redis outage can't block publishing.
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
