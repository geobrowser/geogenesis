import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

/**
 * Two windows, because an anonymous public endpoint has two things worth protecting.
 *
 * The per-address limit stops one visitor hammering submit — a handful of tries is a fat-fingered
 * address, not an attack. The per-IP ceiling is the one that matters: without it this is a free
 * relay for writing arbitrary addresses into someone's mailing list, and the cost of that lands on
 * the list owner rather than on us.
 *
 * Both are generous enough that no real visitor meets them. The same shape as `app/api/chat` uses,
 * so there is one way this codebase rate-limits rather than two.
 */
export const emailLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  analytics: true,
  prefix: 'newsletter:email',
});

export const ipLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  analytics: true,
  prefix: 'newsletter:ip',
});
