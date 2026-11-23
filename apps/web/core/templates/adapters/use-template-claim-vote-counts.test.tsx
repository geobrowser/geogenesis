import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';

import { partitionVoteCountTargets, useTemplateClaimVoteCounts } from './use-template-claim-vote-counts';

const PAGE_SPACE = '11111111-1111-1111-1111-111111111111';
const OTHER_SPACE = '22222222-2222-2222-2222-222222222222';
const HOME_CLAIM = '33333333-3333-3333-3333-333333333333';
const AWAY_CLAIM = '44444444-4444-4444-4444-444444444444';

const mocks = vi.hoisted(() => ({
  batchCalls: [] as Array<{ spaceId: string; targets: Array<{ entityId: string }>; enabled: boolean }>,
  countReads: [] as Array<{ entityId: string; spaceId: string; responseKind: string }>,
  /** What the graph holds per `${claimId}|${spaceId}`. */
  graph: new Map<string, { positive: number; negative: number }>(),
}));

vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseSummaryBatch: (args: (typeof mocks.batchCalls)[number]) => {
    mocks.batchCalls.push(args);
    return {};
  },
}));
vi.mock('~/core/io/queries', () => ({
  getEntityResponseCounts: (entityId: string, spaceId: string, responseKind: string) => {
    mocks.countReads.push({ entityId, spaceId, responseKind });
    return Effect.succeed(mocks.graph.get(`${entityId}|${spaceId}`) ?? null);
  },
}));
vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: (ids: string[]) => ({
    spaces: ids.includes(OTHER_SPACE) ? [{ id: OTHER_SPACE, entity: { name: 'Crypto' } }] : [],
  }),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.batchCalls.length = 0;
  mocks.countReads.length = 0;
  mocks.graph.clear();
});
afterEach(() => client.clear());

describe('partitionVoteCountTargets', () => {
  it('batches only the rows voting in the page space, once per claim', () => {
    const { all, batched, ownReads } = partitionVoteCountTargets(
      [
        { claimId: HOME_CLAIM, spaceId: PAGE_SPACE },
        { claimId: AWAY_CLAIM, spaceId: OTHER_SPACE },
        { claimId: HOME_CLAIM, spaceId: OTHER_SPACE },
      ],
      PAGE_SPACE
    );
    expect(all).toHaveLength(2);
    expect(batched).toEqual([{ claimId: HOME_CLAIM, spaceId: PAGE_SPACE }]);
    expect(ownReads).toEqual([{ claimId: AWAY_CLAIM, spaceId: OTHER_SPACE }]);
  });
});

describe('useTemplateClaimVoteCounts (GEO-3819)', () => {
  it("reads a cross-space claim's counts in its own vote space, the entry its pills read", async () => {
    // The page space holds different numbers for the away claim: the bar must not draw those.
    mocks.graph.set(`${AWAY_CLAIM}|${PAGE_SPACE}`, { positive: 9, negative: 9 });
    mocks.graph.set(`${AWAY_CLAIM}|${OTHER_SPACE}`, { positive: 3, negative: 1 });

    const targets = [
      { claimId: HOME_CLAIM, spaceId: PAGE_SPACE },
      { claimId: AWAY_CLAIM, spaceId: OTHER_SPACE },
    ];
    const { result } = renderHook(() => useTemplateClaimVoteCounts({ pageSpaceId: PAGE_SPACE, targets }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.countsFor(AWAY_CLAIM)).toEqual({ positive: 3, negative: 1 }));
    expect(mocks.countReads).toEqual([{ entityId: AWAY_CLAIM, spaceId: OTHER_SPACE, responseKind: 'stance' }]);
    expect(client.getQueryData(entityResponseCountsQueryKey(AWAY_CLAIM, OTHER_SPACE, 0, 'stance'))).toEqual({
      positive: 3,
      negative: 1,
    });

    // The page's batch is asked for its own row only.
    const lastBatch = mocks.batchCalls.at(-1)!;
    expect(lastBatch.spaceId).toBe(PAGE_SPACE);
    expect(lastBatch.targets.map(target => target.entityId)).toEqual([HOME_CLAIM]);

    expect(result.current.labelFor(OTHER_SPACE, 'Page space')).toBe('Crypto');
    expect(result.current.labelFor(PAGE_SPACE, 'Page space')).toBe('Page space');
  });

  it('draws a page-space row from the entry the batch primes, and follows it when a vote refreshes it', async () => {
    const targets = [{ claimId: HOME_CLAIM, spaceId: PAGE_SPACE }];
    const { result } = renderHook(() => useTemplateClaimVoteCounts({ pageSpaceId: PAGE_SPACE, targets }), {
      wrapper,
    });
    expect(result.current.countsFor(HOME_CLAIM)).toBeNull();

    // What `loadClaimResponseSummaryCaches` (the batch) and a vote's read-back both write.
    const key = entityResponseCountsQueryKey(HOME_CLAIM, PAGE_SPACE, 0, 'stance');
    client.setQueryData(key, { positive: 2, negative: 0 });
    await waitFor(() => expect(result.current.countsFor(HOME_CLAIM)).toEqual({ positive: 2, negative: 0 }));
    client.setQueryData(key, { positive: 2, negative: 1 });
    await waitFor(() => expect(result.current.countsFor(HOME_CLAIM)).toEqual({ positive: 2, negative: 1 }));

    // Primed by the batch, so the row never reads for itself.
    expect(mocks.countReads).toEqual([]);
  });

  it('counts a claim with no votes in its space as zero, not unknown', async () => {
    const targets = [{ claimId: AWAY_CLAIM, spaceId: OTHER_SPACE }];
    const { result } = renderHook(() => useTemplateClaimVoteCounts({ pageSpaceId: PAGE_SPACE, targets }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.countsFor(AWAY_CLAIM)).toEqual({ positive: 0, negative: 0 }));
  });
});
