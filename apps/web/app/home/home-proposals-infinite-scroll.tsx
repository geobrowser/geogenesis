'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';

import { loadMoreHomeProposalsAction } from './load-more-home-proposals-action';

interface Props {
  page: number;
  connectedSpaceId: string;
  connectedAddress: string | undefined;
  proposalType: 'membership' | 'content' | undefined;
  initialHasMore?: boolean;
}

export function HomeProposalsInfiniteScroll({
  connectedSpaceId,
  connectedAddress,
  proposalType,
  page = 0,
  initialHasMore = true,
}: Props) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [loadMoreNodes, setLoadMoreNodes] = React.useState<React.ReactNode[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(initialHasMore);

  const currentPageRef = React.useRef(page);
  const isLoadingRef = React.useRef(false);
  const hasMoreRef = React.useRef(initialHasMore);

  const loadMore = React.useCallback(
    async (abortController?: AbortController) => {
      if (isLoadingRef.current || !hasMoreRef.current) return;

      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const [node, next, more] = await loadMoreHomeProposalsAction(
          connectedSpaceId,
          connectedAddress,
          proposalType,
          currentPageRef.current
        );
        if (abortController?.signal.aborted) return;
        setLoadMoreNodes(prev => [...prev, node]);
        currentPageRef.current = next;
        hasMoreRef.current = more;
        setHasMore(more);
      } finally {
        if (!abortController?.signal.aborted) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [connectedSpaceId, connectedAddress, proposalType]
  );

  React.useEffect(() => {
    const signal = new AbortController();
    const element = buttonRef.current;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isLoadingRef.current && hasMoreRef.current) {
        loadMore(signal);
      }
    });

    if (element) {
      observer.observe(element);
    }

    return () => {
      signal.abort();
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [loadMore]);

  return (
    <div>
      {loadMoreNodes}

      {hasMore && (
        <SmallButton variant="secondary" ref={buttonRef} onClick={() => loadMore()} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Load more'}
        </SmallButton>
      )}
    </div>
  );
}
