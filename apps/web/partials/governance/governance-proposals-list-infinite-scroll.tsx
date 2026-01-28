'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';

import { loadMoreProposalsAction } from './load-more-proposals-action';

interface Props {
  page: number;
  spaceId: string;
}

export function GovernanceProposalsListInfiniteScroll({ spaceId, page = 0 }: Props) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [loadMoreNodes, setLoadMoreNodes] = React.useState<React.JSX.Element[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Use refs for values needed in the observer callback to avoid dependency cycles
  const currentPageRef = React.useRef(page);
  const isLoadingRef = React.useRef(false);

  const loadMore = React.useCallback(
    async (abortController?: AbortController) => {
      // Use ref to check loading state to avoid stale closure
      if (isLoadingRef.current) return;

      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const [node, next] = await loadMoreProposalsAction(spaceId, currentPageRef.current);
        if (abortController?.signal.aborted) return;
        setLoadMoreNodes(prev => [...prev, node]);
        currentPageRef.current = next;
      } finally {
        if (!abortController?.signal.aborted) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    // @TODO this was a hacky workaround to avoid infinite rerenders
    [spaceId]
  );

  React.useEffect(() => {
    const signal = new AbortController();
    const element = buttonRef.current;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isLoadingRef.current) {
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

      <SmallButton variant="secondary" ref={buttonRef} onClick={() => loadMore()} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Load more'}
      </SmallButton>
    </div>
  );
}
