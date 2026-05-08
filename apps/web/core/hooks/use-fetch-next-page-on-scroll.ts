'use client';

import * as React from 'react';

const DEFAULT_FETCH_MORE_DISTANCE_PX = 275;

type UseFetchNextPageOnScrollOptions = {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage: () => unknown;
  distanceFromBottom?: number;
};

export function useFetchNextPageOnScroll<T extends HTMLElement>({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  distanceFromBottom = DEFAULT_FETCH_MORE_DISTANCE_PX,
}: UseFetchNextPageOnScrollOptions): React.UIEventHandler<T> {
  return React.useCallback(
    event => {
      const element = event.currentTarget;
      if (!isNearScrollBottom(element, distanceFromBottom)) return;
      if (hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    },
    [distanceFromBottom, fetchNextPage, hasNextPage, isFetchingNextPage]
  );
}

export function isNearScrollBottom(element: HTMLElement, distanceFromBottom = DEFAULT_FETCH_MORE_DISTANCE_PX): boolean {
  const remainingScroll = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remainingScroll <= distanceFromBottom;
}
