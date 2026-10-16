import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ warmA: vi.fn(), warmB: vi.fn() }));

vi.mock('~/core/explore/warm-fresh-lists', () => ({
  WARM_SCOPES: [
    { name: 'a', warm: () => mocks.warmA() },
    { name: 'b', warm: () => mocks.warmB() },
  ],
}));

async function call(authorization?: string) {
  const { GET } = await import('./route');
  return GET(
    new Request('https://geo.test/api/explore/warm-fresh-list', {
      headers: authorization ? { authorization } : {},
    })
  );
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  mocks.warmA.mockReset().mockResolvedValue('warmed');
  mocks.warmB.mockReset().mockResolvedValue('warmed');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/explore/warm-fresh-list', () => {
  it('rejects a missing or wrong secret without warming anything', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    expect(mocks.warmA).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect((await call('Bearer undefined')).status).toBe(401);
    expect(mocks.warmA).not.toHaveBeenCalled();
  });

  it('warms every scope', async () => {
    mocks.warmB.mockResolvedValue('skipped');
    const response = await call('Bearer test-secret');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      results: [
        { scope: 'a', status: 'warmed' },
        { scope: 'b', status: 'skipped' },
      ],
    });
  });

  it('keeps going when one scope fails, and logs a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.warmA.mockRejectedValue(new Error('gaia down'));
    const response = await call('Bearer test-secret');
    expect(mocks.warmB).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({
      ok: false,
      results: [
        { scope: 'a', status: 'failed' },
        { scope: 'b', status: 'warmed' },
      ],
    });
    expect(warn).toHaveBeenCalled();
  });
});
