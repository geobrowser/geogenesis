'use client';

import * as React from 'react';

/**
 * Returns a ref for a sentinel element placed at the end of a paginated list.
 * When the sentinel scrolls into view (within `rootMargin`), `fetchNextPage`
 * is invoked — generic over any pagination source (React Query infinite
 * queries, manual page accumulation, etc.).
 */
export function useInfiniteScrollSentinel({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin = '200px',
  root = null,
  rootSelector,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  rootMargin?: string;
  /** Scroll container for nested overflow lists; defaults to the viewport when omitted. */
  root?: Element | null;
  /**
   * The scroll container to measure against, found from the sentinel rather than passed in.
   *
   * For a list inside a panel that scrolls separately from the page. `rootMargin` expands the
   * *root*, so against the viewport it buys nothing here: the sentinel is clipped by the panel and
   * only counts as visible once it has actually been scrolled to, which is the moment the lead time
   * was meant to come before. Naming the panel is what makes the margin mean anything.
   */
  rootSelector?: string;
}): React.RefCallback<HTMLDivElement> {
  const [sentinelEl, setSentinelEl] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!sentinelEl || !hasNextPage) return;

    // Resolved here rather than held in state: the sentinel is remounted whenever paging stops and
    // starts, and its container is whatever it finds itself inside at that moment. A selector that
    // matches nothing falls back to the viewport, which is the behaviour every caller had before.
    const scroller = rootSelector ? sentinelEl.closest(rootSelector) : null;
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: scroller ?? root, rootMargin }
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl, fetchNextPage, hasNextPage, isFetchingNextPage, root, rootMargin, rootSelector]);

  return setSentinelEl;
}
