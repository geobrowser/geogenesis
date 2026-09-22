import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NO_SPACE_ACTIVITY_FILTERS } from './space-activity-rows';
import { useSpaceClaimSearch, useSpaceClaimTopicFacet } from './use-space-debate-activity';

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

const facetMocks = vi.hoisted(() => ({
  // Typed through its arguments, so `enabled` — the third, and the whole point of these cases —
  // reads as a boolean rather than as an element of an empty tuple.
  useTaggedTopicFacet: vi.fn((_tagId: string, _filters: unknown, _enabled: boolean) => ({
    topics: [] as { id: string; name: string | null; count: number }[],
    isLoading: false,
    settled: true,
    error: null,
  })),
}));

vi.mock('~/core/debates/tagged-claims', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/tagged-claims')>();
  return { ...actual, useTaggedTopicFacet: facetMocks.useTaggedTopicFacet };
});

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

  /**
   * The topic menu resolves its own ids from this text, through the same hook and the same
   * `[tag, text]` key. Handing back the raw box would key a second search per keystroke — a
   * `/search` request each, and a facet-count request behind it.
   */
  it('hands back the debounced text, not the raw box', async () => {
    mocks.getResultsPage.mockReturnValue(ok(page(['a0'], 1)));

    const { result, rerender } = renderHook(({ text }) => useSpaceClaimSearch(text, true), {
      wrapper,
      initialProps: { text: '' },
    });

    rerender({ text: 'regul' });
    // Mid-debounce the box has moved on and this has not.
    expect(result.current.search).toBe('');

    await settleDebounce();
    await waitFor(() => expect(result.current.search).toBe('regul'));
  });

  /**
   * The cap is a budget on requests, so it counts requests.
   *
   * `useTaggedClaimSearch` drops a page whose rows were all repeats of ones already seen — the
   * endpoint pages over per-space rows, so that happens — and a cap read off the surviving pages
   * would not count those requests at all. Every page here is the same row, so the surviving count
   * never moves past one while the requests keep going.
   */
  it('caps on requests issued, not on pages that survived deduplication', async () => {
    mocks.getResultsPage.mockImplementation(() => ok(page(['same'], 10_000)));

    const { result } = renderHook(() => useSpaceClaimSearch('broad', true), { wrapper });
    await settleDebounce();

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(mocks.getResultsPage).toHaveBeenCalledTimes(10);
  });

  it('asks for nothing and narrows nothing when the box is empty', async () => {
    const { result } = renderHook(() => useSpaceClaimSearch('', true), { wrapper });
    await settleDebounce();

    expect(result.current.claimIds).toBeNull();
    expect(result.current.isPending).toBe(false);
    expect(mocks.getResultsPage).not.toHaveBeenCalled();
  });
});

/**
 * The topic facet, which reads the same accumulating search.
 *
 * `useTaggedTopicFacet` is faked here rather than driven: what is under test is the `enabled` this
 * hook hands it, and the facet's own counting is covered where it lives.
 */
describe('useSpaceClaimTopicFacet', () => {
  it('holds the facet off while the search ids are still arriving', () => {
    renderHook(
      () => useSpaceClaimTopicFacet('space-1', { ...NO_SPACE_ACTIVITY_FILTERS, isSearchPending: true }, true),
      {
        wrapper,
      }
    );

    expect(facetMocks.useTaggedTopicFacet.mock.calls.at(-1)?.[2]).toBe(false);
  });

  it('counts it once they are in', () => {
    renderHook(() => useSpaceClaimTopicFacet('space-1', NO_SPACE_ACTIVITY_FILTERS, true), { wrapper });

    expect(facetMocks.useTaggedTopicFacet.mock.calls.at(-1)?.[2]).toBe(true);
  });

  // Its own caller can still turn it off, and a space with no id has nothing to count.
  it.each([
    ['the caller says no', 'space-1', false],
    ['there is no space', '', true],
  ])('stays off when %s', (_label, spaceId, enabled) => {
    renderHook(() => useSpaceClaimTopicFacet(spaceId, NO_SPACE_ACTIVITY_FILTERS, enabled), { wrapper });

    expect(facetMocks.useTaggedTopicFacet.mock.calls.at(-1)?.[2]).toBe(false);
  });
});
