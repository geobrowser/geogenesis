import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rankingPublishTiming, resetRankingPublishStateForTests } from './ranking-publish-queue';
import { useRankingSubmissions } from './use-ranking-submissions';

/*
 * GEO-3680. A fake index stands in for the Geo API: a sent edit replaces the
 * stored ballot with the votes it carries (as the ranking indexer does), but
 * only after a lag, so an edit built from the list it read can be stale.
 */

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BLOCK = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const RANK = 'cccccccccccccccccccccccccccccccc';
const debate = (n: number) => `${'d'.repeat(31)}${n}`;

type FakeOps = { rankId: string; ids: string[] };

const state = vi.hoisted(() => ({
  index: { rankId: null as string | null, ids: [] as string[] },
  /** What the screen last read (`useMyRanking`). */
  seen: [] as string[],
  indexLagMs: 20,
  indexes: true,
  active: 0,
  maxActive: 0,
  sentBallots: [] as string[][],
}));

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  publish: vi.fn(),
  reportError: vi.fn(),
  setToast: vi.fn(),
  update: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: vi.fn(), analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xabc' }, sendUserOperation: mocks.send } }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: SPACE }),
  personalSpaceIdQueryKey: (address: string) => ['personal-space', address],
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: null }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));
vi.mock('~/core/sdk/geo-client', () => ({
  geo: { personalSpaces: { publishEdit: mocks.publish }, ranks: { update: mocks.update } },
}));
vi.mock('./use-my-ranking', () => ({
  useMyRanking: () => ({
    myRankEntity: state.seen.length > 0 ? { id: RANK, relations: [] } : null,
    orderedEntityIds: state.seen,
    isLoading: false,
    refetchMyRanking: vi.fn(async () => ({})),
  }),
  recordPublishedRank: vi.fn(),
  releasePublishedRankPin: vi.fn(),
  fetchMyRankingBallot: vi.fn(async () => ({
    rankEntity: state.index.rankId ? { id: state.index.rankId, relations: [], createdAt: Date.now() } : null,
    orderedEntityIds: [...state.index.ids],
  })),
}));
vi.mock('./use-ranking-block-config', () => ({
  useRankingBlockConfig: () => ({ isRolling: false, submissionFrequencyHours: null }),
}));
vi.mock('@geoprotocol/geo-sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@geoprotocol/geo-sdk')>();
  return {
    ...actual,
    Ops: {
      ...actual.Ops,
      ranks: {
        create: ({ votes }: { votes: { entityId: string }[] }) => ({
          id: RANK,
          ops: [{ rankId: RANK, ids: votes.map(v => v.entityId) }],
        }),
      },
    },
  };
});

const savedTiming = { ...rankingPublishTiming };

beforeEach(() => {
  vi.clearAllMocks();
  resetRankingPublishStateForTests();
  Object.assign(rankingPublishTiming, { initialDelayMs: 1, pollIntervalMs: 5, maxPollMs: 1_000 });
  state.index = { rankId: null, ids: [] };
  state.seen = [];
  state.indexLagMs = 20;
  state.indexes = true;
  state.active = 0;
  state.maxActive = 0;
  state.sentBallots = [];
  delete process.env.NEXT_PUBLIC_RANKING_BALLOT_MAX_ITEMS;

  mocks.update.mockImplementation(async ({ rankId, votes }: { rankId: string; votes: { entityId: string }[] }) => ({
    id: rankId,
    ops: [{ rankId, ids: votes.map(v => v.entityId) }],
  }));
  mocks.publish.mockImplementation(async ({ ops }: { ops: FakeOps[] }) => ({ to: '0xabc', calldata: ops }));
  mocks.send.mockImplementation(async ({ calls }: { calls: { data: FakeOps[] }[] }) => {
    state.active += 1;
    state.maxActive = Math.max(state.maxActive, state.active);
    const edit = calls[0].data[0];
    state.sentBallots.push(edit.ids);
    await new Promise(resolve => setTimeout(resolve, 5));
    state.active -= 1;
    if (state.indexes) {
      setTimeout(() => {
        state.index = { rankId: edit.rankId, ids: edit.ids };
      }, state.indexLagMs);
    }
    return '0xhash';
  });
});

afterEach(() => {
  Object.assign(rankingPublishTiming, savedTiming);
});

function renderSubmissions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['personal-space', '0xabc'], { personalSpaceId: SPACE, isRegistered: true });
  const view = renderHook(() => useRankingSubmissions(BLOCK, SPACE, 'Best debates'), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { view, client };
}

const slot = (id: string) => ({ id, name: null, spaceId: SPACE });

describe('ranking publish safety (GEO-3680)', () => {
  it('placing 5 debates back to back leaves all 5 in the published list, one publish at a time', async () => {
    const { view, client } = renderSubmissions();
    const save = view.result.current.saveMySubmission;

    // Each placement is built from the list the screen last read (empty): none
    // of them knows about the others.
    let results: unknown[] = [];
    await act(async () => {
      const placements = [1, 2, 3, 4, 5].map(n => save([slot(debate(n))]));
      results = await Promise.all(placements);
      await Promise.all(results.map(r => (r as { indexingSettled: Promise<void> }).indexingSettled));
    });

    expect(results.every(Boolean)).toBe(true);
    expect([...state.index.ids].sort()).toEqual([1, 2, 3, 4, 5].map(debate).sort());
    expect(mocks.send).toHaveBeenCalledTimes(5);
    expect(state.maxActive).toBe(1);
    // Each edit is built on the one before it.
    expect(state.sentBallots.map(ids => ids.length)).toEqual([1, 2, 3, 4, 5]);
    expect(mocks.reportError).not.toHaveBeenCalled();
    expect(view.result.current.isSaving).toBe(false);
    view.unmount();
    client.clear();
  });

  it('keeps both devices’ changes and tells the ranker', async () => {
    // This device read [1]; another device has since published [1, 2].
    state.seen = [debate(1)];
    state.index = { rankId: RANK, ids: [debate(1), debate(2)] };
    const { view, client } = renderSubmissions();

    await act(async () => {
      const published = await view.result.current.saveMySubmission([slot(debate(1)), slot(debate(3))]);
      expect(published?.orderedEntityIds).toEqual([debate(1), debate(2), debate(3)]);
      await published?.indexingSettled;
    });

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ rankId: RANK }));
    expect(state.index.ids).toEqual([debate(1), debate(2), debate(3)]);
    const toastText = JSON.stringify(mocks.setToast.mock.calls.at(-1));
    expect(toastText).toContain('changed on another device');
    view.unmount();
    client.clear();
  });

  it('says nothing about another device when the list is unchanged', async () => {
    state.seen = [debate(1)];
    state.index = { rankId: RANK, ids: [debate(1)] };
    const { view, client } = renderSubmissions();

    await act(async () => {
      const published = await view.result.current.saveMySubmission([slot(debate(2)), slot(debate(1))]);
      expect(published?.orderedEntityIds).toEqual([debate(2), debate(1)]);
      await published?.indexingSettled;
    });

    expect(JSON.stringify(mocks.setToast.mock.calls.at(-1))).toContain('Ranking published!');
    view.unmount();
    client.clear();
  });

  it('refuses to build on an index that has not caught up with the previous publish', async () => {
    state.indexes = false;
    Object.assign(rankingPublishTiming, { maxPollMs: 30 });
    const { view, client } = renderSubmissions();

    let results: unknown[] = [];
    await act(async () => {
      results = await Promise.all([
        view.result.current.saveMySubmission([slot(debate(1))]),
        view.result.current.saveMySubmission([slot(debate(2))]),
      ]);
    });

    expect(results[0]).toBeTruthy();
    expect(results[1]).toBeNull();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.reportError).toHaveBeenCalledWith(expect.stringContaining('still saving'));
    view.unmount();
    client.clear();
  });

  it('stops an oversized ballot with a clear message instead of publishing it', async () => {
    process.env.NEXT_PUBLIC_RANKING_BALLOT_MAX_ITEMS = '3';
    const { view, client } = renderSubmissions();

    await act(async () => {
      const published = await view.result.current.saveMySubmission([1, 2, 3, 4].map(n => slot(debate(n))));
      expect(published).toBeNull();
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledWith('A ranking can hold up to 3 items. Remove 1 item to publish.');
    view.unmount();
    client.clear();
  });
});
