import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// 5h sliding window across the board — a research-heavy turn (opener +
// executor + up to ~5 research sub-calls + closer + follow-ups) shouldn't
// burn an hourly bucket in one shot.
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
