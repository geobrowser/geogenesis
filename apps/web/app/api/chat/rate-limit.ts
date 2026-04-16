import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const loggedInBurstLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 s'),
  analytics: true,
  prefix: 'chat:wallet:burst',
});

export const loggedInHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 h'),
  analytics: true,
  prefix: 'chat:wallet:hour',
});

export const anonBurstLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, '10 s'),
  analytics: true,
  prefix: 'chat:ip:burst',
});

export const anonHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(15, '1 h'),
  analytics: true,
  prefix: 'chat:ip:hour',
});

// Universal IP ceiling applied to every request regardless of auth state.
// Caps wallet-rotation abuse, since the WALLET_ADDRESS cookie is client-set
// and unsigned — a caller can forge it to get a fresh per-wallet quota.
export const ipCeilingBurstLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
  prefix: 'chat:ip-ceiling:burst',
});

export const ipCeilingHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, '1 h'),
  analytics: true,
  prefix: 'chat:ip-ceiling:hour',
});
