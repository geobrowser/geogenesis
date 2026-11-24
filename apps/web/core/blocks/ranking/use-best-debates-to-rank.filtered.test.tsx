import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecentDebate } from './best-debates-debates';
import { NO_RANKING_FILTERS, toRankWindow } from './best-debates-ranking-filters';
import { nyDayStartMs } from './best-debates-views';
import { type RankersRead, useBestDebatesToRank } from './use-best-debates-to-rank';

const mocks = vi.hoisted(() => ({
  matching: vi.fn(),
  recent: vi.fn(),
}));

vi.mock('./best-debates-debates', async importOriginal => ({
  ...(await importOriginal<typeof import('./best-debates-debates')>()),
  fetchMatchingDebates: mocks.matching,
  fetchRecentDebates: mocks.recent,
}));

const TODAY = '2026-11-16';
const rankers: RankersRead = {
  status: 'ready',
  rankerCount: () => 0,
  rankersOf: () => [],
  invalidate: vi.fn(),
};

const debate = (entityId: string, dayKey: string): RecentDebate => ({
  entityId,
  name: entityId,
  createdAtMs: nyDayStartMs(dayKey) + 3_600_000,
  spaceId: 'space',
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.matching.mockReset();
  mocks.recent.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBestDebatesToRank under the screen’s filters (GEO-3774)', () => {
  it('reads an old day from the server and keeps it, without the 7-day cut, minus the draft', async () => {
    mocks.matching.mockResolvedValue({
      debates: [debate('old1', '2026-10-02'), debate('old2', '2026-10-02')],
      capped: true,
    });
    const filters = { ...NO_RANKING_FILTERS, recorded: { kind: 'day' as const, dayKey: '2026-10-02' } };

    const { result } = renderHook(
      () => useBestDebatesToRank({ enabled: true, excludeEntityIds: ['old2'], rankers, filters, todayKey: TODAY }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.debates.map(d => d.entityId)).toEqual(['old1']);
    expect(result.current.windowCount).toBe(2);
    expect(result.current.capped).toBe(true);
    expect(mocks.recent).not.toHaveBeenCalled();
    expect(mocks.matching).toHaveBeenCalledWith({
      and: [
        {
          createdAt: {
            greaterThanOrEqualTo: String(nyDayStartMs('2026-10-02') / 1000),
            lessThan: String(nyDayStartMs('2026-10-03') / 1000),
          },
        },
      ],
    });
  });

  it('cuts a debater-only read to the last 7 days, as the plain To rank does', async () => {
    const now = Date.now();
    const hourStart = Math.floor(now / 3_600_000) * 3_600_000;
    const inWindow: RecentDebate = { entityId: 'fresh', name: 'fresh', createdAtMs: now - 86_400_000, spaceId: 's' };
    // Inside the read (it starts at the top of the hour, 7 days back) but past the 7 days To rank keeps.
    const dropped: RecentDebate = {
      entityId: 'dropped',
      name: 'dropped',
      createdAtMs: Math.max(hourStart - 7 * 86_400_000, now - 7 * 86_400_000 - 1),
      spaceId: 's',
    };
    mocks.matching.mockResolvedValue({ debates: [inWindow, dropped], capped: false });
    const filters = { ...NO_RANKING_FILTERS, debaterIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] };

    const { result } = renderHook(
      () => useBestDebatesToRank({ enabled: true, excludeEntityIds: [], rankers, filters, todayKey: TODAY }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.debates.map(d => d.entityId)).toEqual(['fresh']);
    expect(result.current.windowCount).toBe(1);
  });

  it('keeps the plain 7-day read when no filter is on', async () => {
    mocks.recent.mockResolvedValue([]);
    const { result } = renderHook(
      () => useBestDebatesToRank({ enabled: true, excludeEntityIds: [], rankers, filters: NO_RANKING_FILTERS }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.recent).toHaveBeenCalled();
    expect(mocks.matching).not.toHaveBeenCalled();
  });
});

describe('useBestDebatesToRank ranked matches (GEO-3810)', () => {
  it('without a recorded, debater or claim filter: your whole ranking, of any age, then down ranked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(nyDayStartMs(TODAY) + 12 * 3_600_000);
    mocks.recent.mockResolvedValue([debate('new', TODAY)]);
    const { result } = renderHook(
      () =>
        useBestDebatesToRank({
          enabled: true,
          excludeEntityIds: ['old', 'r2', 'p1'],
          rankers,
          filters: NO_RANKING_FILTERS,
          rankedEntityIds: ['r2', 'old'],
          downRankedEntityIds: ['p1', 'old'],
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // No read for them: they're the draft's ids, in its order; a ranked one isn't down ranked too.
    expect(result.current.rankedMatches).toEqual({ ranked: ['r2', 'old'], downRanked: ['p1'], capped: false });
    expect(mocks.matching).not.toHaveBeenCalled();
    // To rank and its count stay unranked-only.
    expect(result.current.debates.map(d => d.entityId)).toEqual(['new']);
  });

  it('under a debater filter: the ones an all-time read returns, older than 7 days too', async () => {
    const now = Date.now();
    const fresh: RecentDebate = { entityId: 'fresh', name: 'fresh', createdAtMs: now - 86_400_000, spaceId: 's' };
    const old = debate('old', '2026-09-01');
    mocks.matching.mockImplementation(async ({ and }: { and: Record<string, unknown>[] }) =>
      and.some(clause => 'createdAt' in clause)
        ? { debates: [fresh], capped: false }
        : { debates: [fresh, old, debate('p1', '2026-09-02')], capped: true }
    );
    const filters = { ...NO_RANKING_FILTERS, debaterIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] };
    const { result } = renderHook(
      () =>
        useBestDebatesToRank({
          enabled: true,
          excludeEntityIds: ['old', 'other', 'p1', 'p2'],
          rankers,
          filters,
          todayKey: TODAY,
          rankedEntityIds: ['other', 'old'],
          downRankedEntityIds: ['p2', 'p1'],
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.rankedMatches.ranked).toEqual(['old']));
    expect(result.current.rankedMatches).toEqual({ ranked: ['old'], downRanked: ['p1'], capped: true });
    expect(result.current.debates.map(d => d.entityId)).toEqual(['fresh']);
    expect(result.current.capped).toBe(false);
    // To rank's read keeps its 7 days; the ranked one has no date clause.
    const reads = mocks.matching.mock.calls.map(([arg]) => (arg as { and: object[] }).and);
    expect(reads.map(and => and.some(clause => 'createdAt' in clause)).sort()).toEqual([false, true]);
  });

  it('under a recorded day: the same read as To rank, made once', async () => {
    mocks.matching.mockResolvedValue({
      debates: [debate('old1', '2026-10-02'), debate('ranked', '2026-10-02')],
      capped: false,
    });
    const filters = { ...NO_RANKING_FILTERS, recorded: { kind: 'day' as const, dayKey: '2026-10-02' } };
    const { result } = renderHook(
      () =>
        useBestDebatesToRank({
          enabled: true,
          excludeEntityIds: ['ranked', 'elsewhere'],
          rankers,
          filters,
          todayKey: TODAY,
          rankedEntityIds: ['elsewhere', 'ranked'],
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.rankedMatches.ranked).toEqual(['ranked']));
    expect(result.current.debates.map(d => d.entityId)).toEqual(['old1']);
    expect(mocks.matching).toHaveBeenCalledTimes(1);
  });
});

describe('toRankWindow', () => {
  it('is the recorded range when one is picked, else the last 7 days with no end', () => {
    const now = Date.UTC(2026, 10, 16, 12);
    expect(toRankWindow({ ...NO_RANKING_FILTERS, recorded: { kind: 'week' } }, TODAY, now)).toEqual({
      fromMs: nyDayStartMs('2026-11-10'),
      toMs: nyDayStartMs('2026-11-17'),
    });
    expect(toRankWindow({ ...NO_RANKING_FILTERS, debaterIds: ['a'] }, TODAY, now)).toEqual({
      fromMs: now - 7 * 86_400_000,
      toMs: Infinity,
    });
  });
});
