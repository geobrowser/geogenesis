import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// All limiters use a 5h sliding window. The wider window absorbs the multi-
// call shape of a single user turn (opener + executor with up to ~5 research
// sub-calls + closer + follow-ups) so a research-heavy turn doesn't burn an
// hourly bucket in one shot.
export const loggedInLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3_600, '5 h'),
  analytics: true,
  prefix: 'chat:wallet',
});

export const anonLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(180, '5 h'),
  analytics: true,
  prefix: 'chat:ip',
});

export const ipCeilingLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5_400, '5 h'),
  analytics: true,
  prefix: 'chat:ip-ceiling',
});

export const editLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(7_200, '5 h'),
  analytics: true,
  prefix: 'chat:edit',
});
