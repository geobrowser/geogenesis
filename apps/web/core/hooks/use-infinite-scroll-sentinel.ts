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
}) {
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, root, rootMargin]);

  return sentinelRef;
}
