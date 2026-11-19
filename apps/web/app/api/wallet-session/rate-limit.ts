import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Caps on session requests. Both fail open: the token check is the control, these only bound the
 * work. Same lazy, env-gated setup as ranking-og.
 *
 * - Per account (after verification): 120 per 10 min, keyed on the verified Privy user id. A tab
 *   posts once per page load and per token reissue, so this is a page load every 5 s for 10 min.
 * - Per IP (before verification): 1,200 per 10 min, about 10 busy accounts' worth, so a venue or
 *   carrier NAT fits while a forged-token flood from one address still can't drive unbounded
 *   JWKS fetches and signature checks.
 */
export const WALLET_SESSION_ACCOUNT_LIMIT = 120;
export const WALLET_SESSION_IP_LIMIT = 1_200;

function createLimiter(limit: number, prefix: string): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    return new Ratelimit({
      redis: Redis.fromEnv({ retry: { retries: 1 } }),
      limiter: Ratelimit.slidingWindow(limit, '10 m'),
      analytics: true,
      prefix,
    });
  } catch {
    return null;
  }
}

const ipLimiter = createLimiter(WALLET_SESSION_IP_LIMIT, 'wallet-session:ip');
const accountLimiter = createLimiter(WALLET_SESSION_ACCOUNT_LIMIT, 'wallet-session:account');

export type WalletSessionRateLimitResult = { ok: true } | { ok: false; retryAfter: number };

async function check(limiter: Ratelimit | null, key: string): Promise<WalletSessionRateLimitResult> {
  if (!limiter) return { ok: true };
  try {
    const result = await limiter.limit(key);
    if (result.success) return { ok: true };
    return { ok: false, retryAfter: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
  } catch (error) {
    console.error('[wallet-session/rate-limit] unavailable', error);
    return { ok: true };
  }
}

export function checkWalletSessionIpRateLimit(ip: string): Promise<WalletSessionRateLimitResult> {
  return check(ipLimiter, ip);
}

/** `userId` must come from a verified token, never from an unverified claim. */
export function checkWalletSessionAccountRateLimit(userId: string): Promise<WalletSessionRateLimitResult> {
  return check(accountLimiter, userId);
}
