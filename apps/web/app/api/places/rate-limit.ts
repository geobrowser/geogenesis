import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiting for the two Mapbox proxies.
 *
 * These are anonymous, unauthenticated GETs that spend `MAPBOX_TOKEN` — Mapbox Search Box bills
 * per session and per request — so without a limit they are a free, metered API anyone can run in
 * a loop at our expense. Same shape as the newsletter route: public endpoint, real cost per call,
 * no wallet to bucket by.
 *
 * `Redis.fromEnv()` resolves its own configuration and nothing here second-guesses which variables
 * it found. Gating on `UPSTASH_REDIS_REST_URL`/`TOKEN` by name is the mistake `newsletter/rate-limit.ts`
 * documents: Vercel's Upstash integration provisions `KV_REST_API_*`, which `fromEnv()` also
 * accepts, so a name check reads "not configured" on a deploy where the client connects happily.
 * Whether a limiter is usable is answered by calling it.
 *
 * One bucket for both routes. A place search is followed by a retrieve for the chosen suggestion,
 * so they are two halves of one user action and a shared budget is the honest accounting.
 */
const redis = Redis.fromEnv();

export const placesIpLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, '10 m'),
  analytics: true,
  prefix: 'places:ip',
});
