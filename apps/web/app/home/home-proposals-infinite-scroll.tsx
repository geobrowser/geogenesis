'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';
import { loadMoreHomeProposalsAction } from './load-more-home-proposals-action';
import { LoadingSkeleton } from './loading-skeleton';

interface Props {
  page: number;
  connectedSpaceId: string;
  connectedAddress: string | undefined;
  proposalType: 'membership' | 'content' | undefined;
  initialHasMore?: boolean;
  governanceFilters?: {
    spaceId: string;
    category: GovernanceHomeReviewCategory;
    status: GovernanceHomeStatusFilter;
  };
}

export function HomeProposalsInfiniteScroll({
  connectedSpaceId,
  connectedAddress,
  proposalType,
  page = 0,
  initialHasMore = true,
  governanceFilters,
}: Props) {
  const sentinelRef = React.useRef<HTMLDivElement>(null);
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

      // Calling a Next.js server action triggers an RSC refetch for the current
      // route, which reconciles the proposal cards above the sentinel and breaks
      // the browser's scroll anchor — snapping the viewport up to the top of
      // the list. Capture the scroll position and pin it across the load:
      // a single rAF isn't enough because the RSC payload commits asynchronously
      // and images on the new cards can settle 100s of ms later.
      const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
      const pinScroll = () => {
        if (typeof window === 'undefined') return () => {};
        let stopped = false;
        const restore = () => {
          if (stopped) return;
          if (Math.abs(window.scrollY - scrollY) > 1) {
            window.scrollTo(0, scrollY);
          }
        };
        const interval = setInterval(restore, 16);
        const timeout = setTimeout(() => {
          stopped = true;
          clearInterval(interval);
        }, 800);
        return () => {
          stopped = true;
          clearInterval(interval);
          clearTimeout(timeout);
        };
      };
      const stopPinning = pinScroll();

      try {
        const [node, next, more] = await loadMoreHomeProposalsAction(
          connectedSpaceId,
          connectedAddress,
          proposalType,
          currentPageRef.current,
          governanceFilters
        );
        if (abortController?.signal.aborted) {
          stopPinning();
          return;
        }
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
    [connectedSpaceId, connectedAddress, proposalType, governanceFilters]
  );

  React.useEffect(() => {
    const signal = new AbortController();
    const element = sentinelRef.current;

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
    <div className="mt-2 space-y-2">
      {loadMoreNodes.map((node, i) => (
        <React.Fragment key={i}>{node}</React.Fragment>
      ))}

      {hasMore && (
        <div ref={sentinelRef} className="space-y-2">
          {isLoading ? (
            <>
              <LoadingSkeleton />
              <LoadingSkeleton />
            </>
          ) : (
            <SmallButton variant="secondary" onClick={() => loadMore()}>
              Load more
            </SmallButton>
          )}
        </div>
      )}
    </div>
  );
}
