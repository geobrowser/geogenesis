'use client';

import * as React from 'react';

const DEFAULT_FETCH_MORE_DISTANCE_PX = 275;

type UseFetchNextPageOnScrollOptions = {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage: () => unknown;
  distanceFromBottom?: number;
  scrollRef?: React.RefObject<HTMLElement | null>;
};

export function useFetchNextPageOnScroll<T extends HTMLElement>({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  distanceFromBottom = DEFAULT_FETCH_MORE_DISTANCE_PX,
  scrollRef,
}: UseFetchNextPageOnScrollOptions): React.UIEventHandler<T> {
  const fetchIfNeeded = React.useCallback(
    (element: HTMLElement, includeNoOverflow = false) => {
      const noOverflow = element.scrollHeight <= element.clientHeight + 2;
      if (!isNearScrollBottom(element, distanceFromBottom) && !(includeNoOverflow && noOverflow)) return;
      if (hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    },
    [distanceFromBottom, fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  React.useLayoutEffect(() => {
    const element = scrollRef?.current;
    if (!element) return;
    fetchIfNeeded(element, true);
  }, [fetchIfNeeded, scrollRef]);

  return React.useCallback(
    event => {
      fetchIfNeeded(event.currentTarget);
    },
    [fetchIfNeeded]
  );
}

export function isNearScrollBottom(element: HTMLElement, distanceFromBottom = DEFAULT_FETCH_MORE_DISTANCE_PX): boolean {
  const remainingScroll = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remainingScroll <= distanceFromBottom;
}
