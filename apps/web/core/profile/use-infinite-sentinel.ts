'use client';

import * as React from 'react';

/**
 * The bottom-of-list sentinel that pulls the next page in.
 *
 * The same one the explore feed uses, down to the `8000px` margin: the next page
 * is asked for well before the reader reaches the end, so a list they are
 * scrolling never stops under them. Extracted because the three record tabs
 * each need it and a hand-rolled observer per tab is three chances to get the
 * dependency list wrong.
 */
export function useInfiniteSentinel({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element || !hasNextPage) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '8000px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return ref;
}
