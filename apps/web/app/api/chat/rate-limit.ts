import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const loggedInBurstLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 s'),
  analytics: true,
  prefix: 'chat:wallet:burst',
});

export const loggedInHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 h'),
  analytics: true,
  prefix: 'chat:wallet:hour',
});

export const anonBurstLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, '10 s'),
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
  limiter: Ratelimit.slidingWindow(6, '10 s'),
  analytics: true,
  prefix: 'chat:ip-ceiling:burst',
});

export const ipCeilingHourlyLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, '1 h'),
  analytics: true,
  prefix: 'chat:ip-ceiling:hour',
});
