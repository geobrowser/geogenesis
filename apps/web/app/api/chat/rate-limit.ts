import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const loggedInHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3_600, '5 h'),
  analytics: true,
  prefix: 'chat:wallet:hour',
});

export const anonHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(180, '5 h'),
  analytics: true,
  prefix: 'chat:ip:hour',
});

export const ipCeilingHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5_400, '5 h'),
  analytics: true,
  prefix: 'chat:ip-ceiling:hour',
});

export const editHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(7_200, '5 h'),
  analytics: true,
  prefix: 'chat:edit:hour',
});
