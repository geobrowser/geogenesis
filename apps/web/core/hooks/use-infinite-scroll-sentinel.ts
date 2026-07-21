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
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  rootMargin?: string;
  /** Scroll container for nested overflow lists; defaults to the viewport when omitted. */
  root?: Element | null;
}): React.RefCallback<HTMLDivElement> {
  const [sentinelEl, setSentinelEl] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!sentinelEl || !hasNextPage) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root, rootMargin }
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl, fetchNextPage, hasNextPage, isFetchingNextPage, root, rootMargin]);

  return setSentinelEl;
}
