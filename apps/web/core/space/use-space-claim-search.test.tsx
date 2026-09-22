import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSpaceClaimSearch } from './use-space-debate-activity';

/**
 * The search half of the claims feed, against a faked `/search` page source.
 *
 * `useTaggedClaimSearch` is the real hook — the paging, the dedupe across pages and the settled
 * semantics under test all live in it, and stubbing it would test the stub. What is faked is the
 * transport under it.
 */
const mocks = vi.hoisted(() => ({
  getResultsPage: vi.fn(),
}));

vi.mock('~/core/io/queries', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/io/queries')>();
  return { ...actual, getResultsPage: mocks.getResultsPage };
});

/** One `/search` page, in the shape `getResultsPage` resolves to. */
function page(ids: string[], total: number) {
  return {
    results: ids.map(id => ({ id, name: id, types: [], spaceId: 'space-1' })),
    total,
    serverCount: ids.length,
    rawCount: ids.length,
  };
}

/** `getResultsPage` returns an Effect; the hook runs it with `Effect.runPromise`. */
const ok = (value: unknown) => Effect.succeed(value);
const deferred = (promise: Promise<unknown>) => Effect.promise(() => promise);
const boom = (message: string) => Effect.tryPromise(() => Promise.reject(new Error(message)));

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.getResultsPage.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the 250ms search debounce elapse. */
async function settleDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
}

describe('useSpaceClaimSearch', () => {
  /**
   * `/search` answers 100 rows a page and is not scoped to a space, so narrowing by the first page
   * alone lost most of a broad search — measured, 14 of 86 in-space matches for "should". Every
   * page is read before the ids are handed over.
   */
  it('reads every page of matched ids, not just the first', async () => {
    const first = Array.from({ length: 100 }, (_, index) => `a${index}`);
    const second = ['b0', 'b1'];
    mocks.getResultsPage.mockReturnValueOnce(ok(page(first, 102))).mockReturnValueOnce(ok(page(second, 102)));

    const { result } = renderHook(() => useSpaceClaimSearch('should', true), { wrapper });
    await settleDebounce();

    await waitFor(() => expect(result.current.claimIds).toHaveLength(102));
    expect(result.current.isPending).toBe(false);
    expect(mocks.getResultsPage).toHaveBeenCalledTimes(2);
  });

  /**
   * The rows query is keyed on these ids. Handing over a partial set would re-key it once per page
   * of ids arriving — a request each, for an answer already known to be incomplete.
   */
  it('holds the ids back until every page is in', async () => {
    const first = Array.from({ length: 100 }, (_, index) => `a${index}`);
    let releaseSecond: (value: unknown) => void = () => undefined;
    mocks.getResultsPage
      .mockReturnValueOnce(ok(page(first, 150)))
      .mockReturnValueOnce(deferred(new Promise(resolve => (releaseSecond = resolve))));

    const { result } = renderHook(() => useSpaceClaimSearch('should', true), { wrapper });
    await settleDebounce();

    await waitFor(() => expect(result.current.isPending).toBe(true));
    // Nothing partial escapes while a page is still out.
    expect(result.current.claimIds).toBeNull();

    await act(async () => {
      releaseSecond(page(['b0'], 150));
    });
  });

  /**
   * `useTaggedClaimSearch` holds `settled` false on a failure, so a caller reading only that dims
   * the page forever with nothing in flight. The error is surfaced instead, with a retry.
   */
  it('reports a failed search rather than staying pending', async () => {
    mocks.getResultsPage.mockReturnValue(boom('search down'));

    const { result } = renderHook(() => useSpaceClaimSearch('anything', true), { wrapper });
    await settleDebounce();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isPending).toBe(false);
    expect(typeof result.current.retry).toBe('function');
  });

  it('asks for nothing and narrows nothing when the box is empty', async () => {
    const { result } = renderHook(() => useSpaceClaimSearch('', true), { wrapper });
    await settleDebounce();

    expect(result.current.claimIds).toBeNull();
    expect(result.current.isPending).toBe(false);
    expect(mocks.getResultsPage).not.toHaveBeenCalled();
  });
});
