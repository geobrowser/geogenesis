import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: { privateKey: '0xkey', spaceId: 'acceptor-space' } as object | null,
  lockRan: true,
  lockOptions: [] as Array<{ ttlMs: number; waitMs?: number }>,
  sweep: vi.fn(),
}));

vi.mock('~/core/debates/server/acceptor-config', () => ({ getDebateAcceptorConfig: () => mocks.config }));
vi.mock('~/core/debates/server/acceptor-lock', () => ({
  withAcceptorLock: async (fn: () => Promise<unknown>, options: { ttlMs: number; waitMs?: number }) => {
    mocks.lockOptions.push(options);
    return mocks.lockRan ? { ran: true, value: await fn() } : { ran: false };
  },
}));
vi.mock('~/core/debates/server/editor-spaces', () => ({ listEditorSpaceIds: async () => ['space-1'] }));
vi.mock('~/core/space-calls/entities/sweep', () => ({ sweepCallEntities: mocks.sweep }));

const { GET } = await import('./route');

const request = (auth = 'Bearer secret') => new Request('http://x/api', { headers: { authorization: auth } });

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'secret');
  mocks.sweep.mockResolvedValue({ written: ['c1'] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  mocks.config = { privateKey: '0xkey', spaceId: 'acceptor-space' };
  mocks.lockRan = true;
  mocks.lockOptions = [];
  mocks.sweep.mockReset();
});

describe('GET /api/space-calls/entities-sweep', () => {
  it('refuses a call without the cron secret', async () => {
    expect((await GET(request('Bearer nope'))).status).toBe(401);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it('sweeps the editor spaces under the signing lock, without waiting for it', async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ ok: true, calls: { written: ['c1'] } });
    expect(mocks.sweep).toHaveBeenCalledWith(mocks.config, ['space-1'], expect.anything());
    expect(mocks.lockOptions).toEqual([{ ttlMs: 300_000 }]);
  });

  it('stops claiming a minute in', async () => {
    vi.useFakeTimers();
    try {
      await GET(request());
      const { canStart } = mocks.sweep.mock.calls[0]![2] as { canStart: () => boolean };
      expect(canStart()).toBe(true);
      vi.advanceTimersByTime(60_000);
      expect(canStart()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips the tick while another run signs, or with no acceptor', async () => {
    mocks.lockRan = false;
    expect(await (await GET(request())).json()).toEqual({ ok: true, skipped: 'acceptor_busy' });
    mocks.config = null;
    expect(await (await GET(request())).json()).toEqual({ ok: true, skipped: 'acceptor_not_configured' });
    expect(mocks.sweep).not.toHaveBeenCalled();
  });
});
