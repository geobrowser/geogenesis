import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Configured exactly the way `app/api/chat` does it, and for a reason worth recording.
 *
 * An earlier version of this file gated on `process.env.UPSTASH_REDIS_REST_URL/TOKEN` before
 * building a client, so that an unconfigured machine could be told apart from an unreachable one.
 * It was wrong, and wrong in a way nothing local could show: `Redis.fromEnv()` resolves
 * `KV_REST_API_URL`/`KV_REST_API_TOKEN` as well — the names Vercel's own Upstash integration
 * provisions — so on a deploy carrying only those, the client connects happily while a check
 * naming the other pair reads as "not configured". Chat's limiters worked on the same deployment
 * where this one refused every request.
 *
 * So the client resolves its own configuration and nothing here second-guesses which variables it
 * found. Whether a limiter is *usable* is answered where it is used, by calling it.
 */
const redis = Redis.fromEnv();

/**
 * Two windows, because an anonymous public endpoint has two things worth protecting.
 *
 * The per-address limit stops one visitor hammering submit — a handful of tries is a fat-fingered
 * address, not an attack. The per-IP ceiling is the one that matters: without it this is a free
 * relay for writing arbitrary addresses into someone's mailing list, and the cost of that lands on
 * the list owner rather than on us.
 *
 * Both are generous enough that no real visitor meets them.
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
