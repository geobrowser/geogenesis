import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_RESPONSE_OBJECT_TYPE, useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { entityResponseCountsQueryKey, userEntityResponseQueryKey } from '~/core/responses/entity-response';

const VIEWER_SPACE = 'space-viewer';
const CLAIM = 'claim-1';
const SPACE = 'space-1';

const mocks = vi.hoisted(() => ({
  batch: { managed: false, ready: true },
  /** The viewer's personal space, which the indexed-response query is gated on. */
  personalSpace: { personalSpaceId: 'space-viewer' as string | null, isLoading: false },
  /** What the indexing snapshot reports — not a query, so `enabled` never reaches it. */
  indexing: { status: 'idle', pending: null, runId: null } as {
    status: 'idle' | 'reconciling' | 'delayed' | 'indexed';
    pending: { expectedResponse: 'positive' | 'negative' | null } | null;
    runId: string | null;
  },
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => mocks.personalSpace,
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.indexing,
}));

vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseBatchState: () => mocks.batch,
}));

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Someone else's surface already asked for this claim under `stance` and got an answer. */
function primeStanceCache() {
  queryClient.setQueryData(entityResponseCountsQueryKey(CLAIM, SPACE, CLAIM_RESPONSE_OBJECT_TYPE, 'stance'), {
    positive: 9,
    negative: 3,
  });
  queryClient.setQueryData(
    userEntityResponseQueryKey(VIEWER_SPACE, CLAIM, SPACE, CLAIM_RESPONSE_OBJECT_TYPE, 'stance'),
    'positive'
  );
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.batch = { managed: false, ready: true };
  mocks.personalSpace = { personalSpaceId: VIEWER_SPACE, isLoading: false };
  mocks.indexing = { status: 'idle', pending: null, runId: null };
});

afterEach(() => queryClient.clear());

describe('useClaimResponseSummary when disabled', () => {
  it('answers nothing rather than whatever is cached under the same key', () => {
    // `enabled: false` stops React Query fetching; it does not stop it returning cached data for the
    // key. The key carries the response kind, so a caller that disabled this hook *because* the kind
    // is still the `stance` fallback would read a stance split someone else primed — the exact
    // number it was withholding the pills over.
    primeStanceCache();

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', false), { wrapper });

    expect(result.current.total).toBe(0);
    expect(result.current.percent).toBeNull();
    expect(result.current.viewerDirection).toBeNull();
    // Held back is not loading: nothing was asked for, so there is nothing to wait on.
    expect(result.current.isLoading).toBe(false);
  });

  it('masks the viewer’s side even though the indexing snapshot is not a query', () => {
    // The optimistic snapshot answers regardless of `enabled`, so masking only the two queries would
    // still draw the viewer onto a side of a split that is not being shown.
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'positive' }, runId: 'run-1' };

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', false), { wrapper });

    expect(result.current.viewerDirection).toBeNull();
    expect(result.current.positive).toBe(0);
  });

  it('still reports who the viewer is, which is not a response', () => {
    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', false), { wrapper });

    expect(result.current.viewerSpaceId).toBe(VIEWER_SPACE);
  });

  it('reads the primed cache once enabled, so the mask is the only thing withholding it', () => {
    // Sabotage guard: without this the first test would pass on a hook that never reads the cache
    // at all, and would say nothing about masking.
    primeStanceCache();

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', true), { wrapper });

    expect(result.current.positive).toBe(9);
    expect(result.current.negative).toBe(3);
  });

  it('does not mask a batch, whose primed cache is the intended source', () => {
    // The batch disables the same two queries for a different reason: `ClaimResponseBatchBoundary`
    // primes exactly these keys from one request. Masking there would blank every row on the page
    // that batches its claims.
    primeStanceCache();
    mocks.batch = { managed: true, ready: true };

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', true), { wrapper });

    expect(result.current.positive).toBe(9);
    expect(result.current.total).toBe(12);
  });
});

/** Only the counts. The viewer's own indexed response is a separate key and stays unanswered. */
function primeCountsOnly() {
  queryClient.setQueryData(entityResponseCountsQueryKey(CLAIM, SPACE, CLAIM_RESPONSE_OBJECT_TYPE, 'stance'), {
    positive: 9,
    negative: 3,
  });
}

describe('useClaimResponseSummary and the viewer’s own side', () => {
  it('reports the viewer’s side as unsettled while the personal space is still resolving', () => {
    // The bug this exists for. The counts and the viewer's own response are two queries, and the
    // second is gated on the personal space — a smart-account read plus a round trip, so it settles
    // *after* the counts. A caller reading `isLoading` for both sees the counts land, calls the
    // viewer's side resolved while it is still null, draws both pills unselected for someone who
    // already holds one, and turns a press on the side they hold into a republish.
    primeCountsOnly();
    mocks.personalSpace = { personalSpaceId: null, isLoading: true };

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', true), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isViewerResponseLoading).toBe(true);
    expect(result.current.viewerDirection).toBeNull();
  });

  it('stays unsettled after the personal space lands but before its query answers', () => {
    // The second half of the same window, and the reason this reads `isFetched` rather than the
    // query's own `isLoading`: that reads false for a tick after a query becomes enabled and before
    // it dispatches, which is precisely the gap being covered.
    primeCountsOnly();

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', true), { wrapper });

    expect(result.current.isViewerResponseLoading).toBe(true);
  });

  it('settles once the viewer’s own response has answered', () => {
    primeStanceCache();

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', true), { wrapper });

    expect(result.current.isViewerResponseLoading).toBe(false);
    expect(result.current.viewerDirection).toBe('positive');
  });

  it('is settled immediately for a signed-out viewer, who is waiting for nothing', () => {
    // No personal space and none coming. `null` here is a settled "no side", not a pending one, and
    // reporting otherwise would leave the pills dead for every signed-out reader.
    primeCountsOnly();
    mocks.personalSpace = { personalSpaceId: null, isLoading: false };

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', true), { wrapper });

    expect(result.current.isViewerResponseLoading).toBe(false);
  });

  it('follows the batch rather than its own queries while one manages the subtree', () => {
    // Under a boundary neither query runs and the batch primes both keys, so the batch's readiness
    // is the only thing either flag can wait on.
    mocks.batch = { managed: true, ready: false };

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', true), { wrapper });

    expect(result.current.isViewerResponseLoading).toBe(true);

    mocks.batch = { managed: true, ready: true };
    primeStanceCache();

    const ready = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', true), { wrapper });

    expect(ready.result.current.isViewerResponseLoading).toBe(false);
  });

  it('is settled while held back, which is not the same as waiting', () => {
    mocks.personalSpace = { personalSpaceId: null, isLoading: true };

    const { result } = renderHook(() => useClaimResponseSummary(CLAIM, SPACE, 'stance', false), { wrapper });

    expect(result.current.isViewerResponseLoading).toBe(false);
  });
});
