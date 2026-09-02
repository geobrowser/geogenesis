import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateNotPublishableError } from '~/core/debates/server/debate-source';

const mocks = vi.hoisted(() => ({
  candidates: {} as Record<string, string[]>,
  editorSpaceIds: [] as string[],
  publish: vi.fn(),
}));

vi.mock('~/core/debates/server/acceptor-config', () => ({
  getDebateAcceptorConfig: () => ({ privateKey: '0xkey', spaceId: 'acceptor-space' }),
}));

vi.mock('~/core/debates/server/editor-spaces', () => ({
  listEditorSpaceIds: async () => mocks.editorSpaceIds,
}));

// `DebateNotPublishableError` stays real: the route branches on `instanceof`, so a stubbed class
// would send every outcome down the generic-failure path and the test would prove nothing.
vi.mock('~/core/debates/server/debate-source', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/server/debate-source')>()),
  listSweepCandidateDebateIds: async (spaceId: string) => mocks.candidates[spaceId] ?? [],
}));

vi.mock('~/core/debates/server/publish-debate', () => ({
  publishDebateAsAcceptor: (debateId: string) => mocks.publish(debateId),
}));

async function sweep() {
  const { GET } = await import('./route');
  const response = await GET(
    new Request('https://geo.test/api/debates/publish-sweep', { headers: { authorization: 'Bearer test-secret' } })
  );
  return response.json();
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  mocks.editorSpaceIds = ['space-1'];
  mocks.candidates = {};
  mocks.publish.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const publishedResult = { status: 'published', debateEntityId: 'e', spaceId: 'space-1', userOpHash: '0x1' };

describe('publish sweep', () => {
  it('refuses a request without the cron secret', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('https://geo.test/api/debates/publish-sweep'));

    expect(response.status).toBe(401);
  });

  it('publishes an eligible debate', async () => {
    mocks.candidates = { 'space-1': ['debate-1'] };
    mocks.publish.mockResolvedValue({
      status: 'published',
      debateEntityId: 'e1',
      spaceId: 'space-1',
      userOpHash: '0x1',
    });

    await expect(sweep()).resolves.toMatchObject({ ok: true, published: ['debate-1'] });
  });

  // The distinction this whole change exists for. A dead media job and a still-rendering one used to
  // share `media_not_ready`, so a debate that could never publish was counted as a healthy backlog
  // on every tick, forever — indistinguishable from one that would finish in a minute.
  it('reports a permanently failed media job apart from a pending one', async () => {
    mocks.candidates = { 'space-1': ['dead', 'rendering'] };
    mocks.publish.mockImplementation(async (debateId: string) => {
      throw debateId === 'dead'
        ? new DebateNotPublishableError('media_failed', 'media job failed permanently')
        : new DebateNotPublishableError('media_not_ready', 'media is not ready');
    });

    await expect(sweep()).resolves.toMatchObject({ mediaFailed: ['dead'], pending: 1 });
  });

  // Two stuck debates must not cost the sweep its budget, or a permanent failure would stall
  // publishing for everyone else.
  it('does not spend the attempt budget on unpublishable debates', async () => {
    mocks.candidates = { 'space-1': ['dead-1', 'dead-2', 'dead-3', 'publishable'] };
    mocks.publish.mockImplementation(async (debateId: string) => {
      if (debateId === 'publishable') {
        return { status: 'published', debateEntityId: 'e', spaceId: 'space-1', userOpHash: '0x1' };
      }
      throw new DebateNotPublishableError('media_failed', 'media job failed permanently');
    });

    const result = await sweep();

    expect(result.mediaFailed).toEqual(['dead-1', 'dead-2', 'dead-3']);
    expect(result.published).toEqual(['publishable']);
  });

  it('reports an empty list when nothing is stuck', async () => {
    mocks.candidates = { 'space-1': [] };

    await expect(sweep()).resolves.toMatchObject({ mediaFailed: [], pending: 0 });
  });

  it('does not spend the attempt budget on debates the acceptor cannot edit', async () => {
    const parked = Array.from({ length: 8 }, (_, i) => `parked-${i}`);
    mocks.candidates = { 'space-1': [...parked, 'publishable'] };
    mocks.publish.mockImplementation(async (debateId: string) =>
      debateId === 'publishable' ? publishedResult : { status: 'not_editor', debateEntityId: 'e', spaceId: 'space-1' }
    );

    await expect(sweep()).resolves.toMatchObject({ notEditor: 8, published: ['publishable'] });
  });

  it('stops starting publishes once the time budget is spent', async () => {
    vi.useFakeTimers();
    mocks.editorSpaceIds = ['space-1', 'space-2'];
    mocks.candidates = { 'space-1': ['first', 'second'], 'space-2': ['third'] };
    mocks.publish.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 181_000);
      return publishedResult;
    });

    await expect(sweep()).resolves.toMatchObject({ published: ['first'] });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it('refuses the whole run when the media host is misconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_DEBATE_MEDIA_BASE_URL', '');
    mocks.candidates = { 'space-1': ['debate-1'] };

    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://geo.test/api/debates/publish-sweep', { headers: { authorization: 'Bearer test-secret' } })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/media host/) });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
