import { describe, expect, it } from 'vitest';

import type { DataBlockView } from './data-block-view';
import {
  buildAccumulationResetKey,
  resolveInfiniteScrollDisplay,
  viewRendersAllEntries,
} from './infinite-scroll-display';

describe('viewRendersAllEntries', () => {
  it.each<DataBlockView>(['LIST', 'BULLETED_LIST', 'GALLERY', 'PILL', 'EXPLORE'])('allows %s', view => {
    expect(viewRendersAllEntries(view)).toBe(true);
  });

  // TableBlockTable paginates internally at 9 rows with no pager, so accumulating into it walks
  // the whole source while the user sees nine rows.
  it('refuses TABLE', () => {
    expect(viewRendersAllEntries('TABLE')).toBe(false);
  });

  // TableBlockTable is also the fallback renderer, so an unrecognised view must default to off
  // rather than inherit the capped renderer with infinite scroll switched on.
  it('refuses a view it does not know about', () => {
    expect(viewRendersAllEntries('SOME_FUTURE_VIEW' as DataBlockView)).toBe(false);
  });
});

describe('buildAccumulationResetKey', () => {
  const base = {
    isInfiniteScroll: true,
    pageSize: 25,
    sourceKey: '"GEO"',
    whereKey: '{"values":[{"property":"a","value":"b"}]}',
    sortKey: 'null',
  };

  it('is stable for identical input', () => {
    expect(buildAccumulationResetKey(base)).toBe(buildAccumulationResetKey({ ...base }));
  });

  // This only pins that distinct query identities produce distinct keys. The regression it is
  // named for — the caller passing a projection of the filter state instead of the query's own
  // identity — lives in `table-block.tsx`, which has no test harness, so it is not covered here.
  it('changes when the query identity changes', () => {
    const asRelation = buildAccumulationResetKey({
      ...base,
      whereKey: '{"relations":[{"property":"a","toEntity":"b"}]}',
    });
    const asText = buildAccumulationResetKey({ ...base, whereKey: '{"values":[{"property":"a","contains":"b"}]}' });
    expect(asRelation).not.toBe(asText);
  });

  it.each([
    ['pageSize', { pageSize: 50 }],
    ['sourceKey', { sourceKey: '"other-space"' }],
    ['sortKey', { sortKey: '{"columnId":"a","direction":"ASC"}' }],
    ['isInfiniteScroll', { isInfiniteScroll: false }],
  ])('changes when %s changes', (_label, override) => {
    expect(buildAccumulationResetKey({ ...base, ...override })).not.toBe(buildAccumulationResetKey(base));
  });

  it('does not collide when two fields swap values', () => {
    const a = buildAccumulationResetKey({ ...base, sourceKey: 'x', sortKey: 'y' });
    const b = buildAccumulationResetKey({ ...base, sourceKey: 'y', sortKey: 'x' });
    expect(a).not.toBe(b);
  });
});

describe('resolveInfiniteScrollDisplay', () => {
  const base = {
    isInfiniteScroll: true,
    hasRows: true,
    hasNextPage: true,
    hasError: false,
    isFetchingNextPage: false,
    isFetched: true,
    isLoading: false,
    isCollection: false,
  };

  it('mounts the sentinel on a healthy list with more pages', () => {
    expect(resolveInfiniteScrollDisplay(base)).toEqual({
      showSentinel: true,
      showSkeleton: false,
      showRetry: false,
      showEmptyState: false,
    });
  });

  it('drops the sentinel once the source is exhausted', () => {
    expect(resolveInfiniteScrollDisplay({ ...base, hasNextPage: false }).showSentinel).toBe(false);
  });

  it('shows the skeleton while a later page is in flight', () => {
    const result = resolveInfiniteScrollDisplay({ ...base, isFetchingNextPage: true });
    expect(result.showSkeleton).toBe(true);
    expect(result.showRetry).toBe(false);
  });

  // A failed fetch settles as isFetched with an empty local-store fallback and hasNextPage false.
  // Without the error signal that is indistinguishable from an exhausted, empty result set.
  it('offers a retry instead of the placeholder when the first page fails', () => {
    expect(resolveInfiniteScrollDisplay({ ...base, hasRows: false, hasNextPage: false, hasError: true })).toEqual({
      showSentinel: false,
      showSkeleton: false,
      showRetry: true,
      showEmptyState: false,
    });
  });

  // Previously this left the skeleton pulsing forever: the page was never recorded, so
  // isFetchingNextPage stayed true while the sentinel was unmounted by hasNextPage going false.
  it('offers a retry instead of an endless skeleton when a later page fails', () => {
    expect(
      resolveInfiniteScrollDisplay({ ...base, hasNextPage: false, hasError: true, isFetchingNextPage: true })
    ).toEqual({
      showSentinel: false,
      showSkeleton: false,
      showRetry: true,
      showEmptyState: false,
    });
  });

  // Deliberately does NOT keep fetching, even though more pages exist: the sentinel would sit
  // alone in an empty container with a 1000px root margin, stay intersecting, and walk the entire
  // source unbounded. This matches the pre-branch behaviour. The case is rare rather than
  // impossible: `isEntityVisibleInBlock` hides entities registered at creation time, and that
  // registry is module-level, so it outlives the edit session that filled it.
  it('does not auto-walk when a page yields no visible rows', () => {
    expect(resolveInfiniteScrollDisplay({ ...base, hasRows: false })).toEqual({
      showSentinel: false,
      showSkeleton: false,
      showRetry: false,
      showEmptyState: true,
    });
  });

  // Pins the `hasRows` half of `showSkeleton`: with nothing rendered above it the skeleton is the
  // whole list, which reads as a permanently loading block rather than a finished empty one.
  it('does not show a bare skeleton when there are no rows to append to', () => {
    expect(resolveInfiniteScrollDisplay({ ...base, hasRows: false, isFetchingNextPage: true }).showSkeleton).toBe(
      false
    );
  });

  it('shows the placeholder only when there is genuinely nothing more to fetch', () => {
    expect(resolveInfiniteScrollDisplay({ ...base, hasRows: false, hasNextPage: false }).showEmptyState).toBe(true);
  });

  it('never shows the placeholder while still loading', () => {
    expect(
      resolveInfiniteScrollDisplay({ ...base, hasRows: false, hasNextPage: false, isLoading: true }).showEmptyState
    ).toBe(false);
    expect(
      resolveInfiniteScrollDisplay({ ...base, hasRows: false, hasNextPage: false, isFetched: false }).showEmptyState
    ).toBe(false);
  });

  it('leaves the collection empty state to the collection renderer', () => {
    expect(
      resolveInfiniteScrollDisplay({ ...base, hasRows: false, hasNextPage: false, isCollection: true }).showEmptyState
    ).toBe(false);
  });

  describe('when infinite scroll is off', () => {
    const paged = { ...base, isInfiniteScroll: false };

    it('renders no infinite-scroll affordances at all', () => {
      const result = resolveInfiniteScrollDisplay({ ...paged, hasNextPage: true });
      expect(result.showSentinel).toBe(false);
      expect(result.showSkeleton).toBe(false);
      expect(result.showRetry).toBe(false);
    });

    it('still shows the placeholder for an empty result set', () => {
      expect(resolveInfiniteScrollDisplay({ ...paged, hasRows: false }).showEmptyState).toBe(true);
    });
  });
});
