import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Whether Upstash is configured at all — which is a different question from whether it is working,
 * and the two want opposite answers.
 *
 * `Redis.fromEnv()` hands back a client whether or not the variables exist and only fails once a
 * command runs, so without this check "not set up" and "briefly unreachable" arrive at the route as
 * the same thrown error. They are not the same: an outage against a configured Redis is exactly
 * when this endpoint must refuse, since it writes into someone else's mailing list for anonymous
 * callers; a developer who has never had Upstash credentials is not a threat model, and failing
 * closed there only means the feature cannot be tried locally at all.
 *
 * The route keeps the strict half of that: unconfigured is tolerated in development and refused in
 * production, so a deploy that is missing its credentials fails loudly instead of quietly becoming
 * an open relay.
 */
export const hasUpstashEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Built only when there is something to connect to, so an unconfigured environment holds a plain
// `null` rather than a client that throws on first use.
const redis = hasUpstashEnv ? Redis.fromEnv() : null;

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
export const emailLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '10 m'), analytics: true, prefix: 'newsletter:email' })
  : null;

export const ipLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 h'), analytics: true, prefix: 'newsletter:ip' })
  : null;
