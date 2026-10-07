import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateNotPublishableError } from '~/core/debates/server/debate-source';

const mocks = vi.hoisted(() => ({
  candidates: {} as Record<string, string[]>,
  candidateCalls: [] as Array<{ spaceId: string; recentMs: number }>,
  editorSpaceIds: [] as string[],
  publish: vi.fn(),
  lockRan: true,
}));

vi.mock('~/core/debates/server/acceptor-config', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/server/acceptor-config')>()),
  getDebateAcceptorConfig: () => ({ privateKey: '0xkey', spaceId: 'acceptor-space' }),
}));

vi.mock('~/core/debates/server/editor-spaces', () => ({
  listEditorSpaceIds: async () => mocks.editorSpaceIds,
}));

vi.mock('~/core/debates/server/acceptor-lock', () => ({
  withAcceptorLock: async (fn: () => Promise<unknown>) =>
    mocks.lockRan ? { ran: true, value: await fn() } : { ran: false },
}));

// `DebateNotPublishableError` stays real: the route branches on `instanceof`.
vi.mock('~/core/debates/server/debate-source', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/server/debate-source')>()),
  listEarlyClaimCandidateDebateIds: async (spaceId: string, _now: number, recentMs: number) => {
    mocks.candidateCalls.push({ spaceId, recentMs });
    return mocks.candidates[spaceId] ?? [];
  },
}));

vi.mock('~/core/debates/server/publish-debate-claims', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/server/publish-debate-claims')>()),
  publishDebateClaimsEarly: (debateId: string) => mocks.publish(debateId),
}));

async function sweep(authorization = 'Bearer test-secret') {
  const { GET } = await import('./route');
  const response = await GET(
    new Request('https://geo.test/api/debates/publish-claims-sweep', { headers: { authorization } })
  );
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  mocks.editorSpaceIds = ['space-1'];
  mocks.candidates = {};
  mocks.candidateCalls = [];
  mocks.publish.mockReset();
  mocks.lockRan = true;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('early claims publish sweep', () => {
  it('refuses a request without the cron secret', async () => {
    expect((await sweep('Bearer wrong')).status).toBe(401);
  });

  it('can be switched off', async () => {
    vi.stubEnv('DEBATE_EARLY_CLAIM_PUBLISH_ENABLED', 'false');
    expect((await sweep()).body).toEqual({ ok: true, skipped: 'disabled' });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('skips the run while the other sweep holds the signing lock', async () => {
    mocks.lockRan = false;
    mocks.candidates = { 'space-1': ['d1'] };
    expect((await sweep()).body).toEqual({ ok: true, skipped: 'acceptor_busy' });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('publishes each recent debate’s claims and counts every outcome', async () => {
    mocks.editorSpaceIds = ['space-1', 'space-2'];
    mocks.candidates = { 'space-1': ['d1', 'd2', 'd3'], 'space-2': ['d4', 'd5', 'd7', 'd6'] };
    mocks.publish.mockImplementation(async (debateId: string) => {
      switch (debateId) {
        case 'd1':
          return { status: 'published', spaceId: 'space-1', claimIds: ['a', 'b'], userOpHash: '0x1' };
        case 'd2':
          return { status: 'up_to_date', spaceId: 'space-1' };
        case 'd3':
          return { status: 'debate_published' };
        case 'd4':
          return { status: 'no_claims' };
        case 'd5':
          throw new DebateNotPublishableError('recording_cancelled', 'cancelled');
        case 'd7':
          return { status: 'dedup_pending' };
        default:
          throw new Error('rpc down');
      }
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { body } = await sweep();

    expect(body).toEqual({
      ok: true,
      published: [{ debateId: 'd1', claims: 2 }],
      upToDate: 1,
      noClaims: 1,
      dedupPending: 1,
      debatePublished: 1,
      notEditor: 0,
      notPublishable: 1,
      failed: [{ debateId: 'd6', error: 'rpc down' }],
    });
    // Only recent debates are asked about.
    expect(mocks.candidateCalls.map(call => call.recentMs)).toEqual([3 * 60 * 60 * 1000, 3 * 60 * 60 * 1000]);
    error.mockRestore();
  });

  it('stops starting publishes once its attempt budget is spent', async () => {
    mocks.candidates = { 'space-1': ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] };
    mocks.publish.mockResolvedValue({ status: 'published', spaceId: 'space-1', claimIds: ['a'], userOpHash: '0x1' });

    const { body } = await sweep();

    expect(body.published).toHaveLength(4);
    expect(mocks.publish).toHaveBeenCalledTimes(4);
  });

  it('does not spend the budget on debates with nothing to publish', async () => {
    mocks.candidates = { 'space-1': ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] };
    mocks.publish.mockResolvedValue({ status: 'up_to_date', spaceId: 'space-1' });

    const { body } = await sweep();

    expect(body.upToDate).toBe(6);
  });

  it('keeps going past a space whose debates cannot be listed', async () => {
    mocks.editorSpaceIds = ['broken', 'space-1'];
    mocks.candidates = { 'space-1': ['d1'] };
    mocks.publish.mockResolvedValue({ status: 'no_claims' });
    Object.defineProperty(mocks.candidates, 'broken', {
      get() {
        throw new Error('geo-chat 503');
      },
    });

    const { body } = await sweep();

    expect(body.failed).toEqual([{ debateId: 'space:broken', error: 'geo-chat 503' }]);
    expect(body.noClaims).toBe(1);
  });
});
