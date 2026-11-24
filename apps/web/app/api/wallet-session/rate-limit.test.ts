import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limiters: [] as Array<{ prefix: string; limit: ReturnType<typeof vi.fn> }>,
  windows: [] as number[],
}));

vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => ({}) } }));
vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow = (limit: number) => {
      mocks.windows.push(limit);
      return limit;
    };
    limit = vi.fn(async () => ({ success: true, reset: Date.now() }));
    constructor({ prefix }: { prefix: string }) {
      mocks.limiters.push({ prefix, limit: this.limit });
    }
  }
  return { Ratelimit };
});

beforeEach(() => {
  vi.resetModules();
  mocks.limiters = [];
  mocks.windows = [];
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.test');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
});

afterEach(() => vi.unstubAllEnvs());

const limiter = (prefix: string) => mocks.limiters.find(l => l.prefix === prefix)!;

describe('wallet session rate limits', () => {
  it('keys the IP backstop and the account limit separately, at their own caps', async () => {
    const { checkWalletSessionAccountRateLimit, checkWalletSessionIpRateLimit } = await import('./rate-limit');
    expect(mocks.windows).toEqual([1_200, 120]);

    await checkWalletSessionIpRateLimit('203.0.113.7');
    await checkWalletSessionAccountRateLimit('did:privy:1');

    expect(limiter('wallet-session:ip').limit).toHaveBeenCalledWith('203.0.113.7');
    expect(limiter('wallet-session:account').limit).toHaveBeenCalledWith('did:privy:1');
  });

  it('answers with a retry time once a limit trips', async () => {
    const { checkWalletSessionIpRateLimit } = await import('./rate-limit');
    limiter('wallet-session:ip').limit.mockResolvedValueOnce({ success: false, reset: Date.now() + 42_000 });
    await expect(checkWalletSessionIpRateLimit('203.0.113.7')).resolves.toEqual({ ok: false, retryAfter: 42 });
  });

  it('fails open when Upstash is down', async () => {
    const { checkWalletSessionAccountRateLimit } = await import('./rate-limit');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    limiter('wallet-session:account').limit.mockRejectedValueOnce(new Error('down'));
    await expect(checkWalletSessionAccountRateLimit('did:privy:1')).resolves.toEqual({ ok: true });
    error.mockRestore();
  });

  it('is off without Upstash configured', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    const { checkWalletSessionAccountRateLimit } = await import('./rate-limit');
    expect(mocks.limiters).toHaveLength(0);
    await expect(checkWalletSessionAccountRateLimit('did:privy:1')).resolves.toEqual({ ok: true });
  });
});
