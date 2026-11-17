import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Per-IP cap on session requests, each of which verifies a Privy token. Fails open: the token
 * check is the control, this only bounds the work. Same lazy, env-gated setup as ranking-og.
 */
let limiter: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    limiter = new Ratelimit({
      redis: Redis.fromEnv({ retry: { retries: 1 } }),
      limiter: Ratelimit.slidingWindow(120, '10 m'),
      analytics: true,
      prefix: 'wallet-session:ip',
    });
  } catch {
    limiter = null;
  }
}

export type WalletSessionRateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export async function checkWalletSessionIpRateLimit(ip: string): Promise<WalletSessionRateLimitResult> {
  if (!limiter) return { ok: true };
  try {
    const result = await limiter.limit(ip);
    if (result.success) return { ok: true };
    return { ok: false, retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
  } catch (error) {
    console.error('[wallet-session/rate-limit] unavailable', error);
    return { ok: true };
  }
}
