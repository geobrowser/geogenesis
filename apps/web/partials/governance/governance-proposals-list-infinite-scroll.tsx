'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';

import { loadMoreProposalsAction } from './load-more-proposals-action';

interface Props {
  page: number;
  spaceId: string;
}

export function GovernanceProposalsListInfiniteScroll({ spaceId, page = 0 }: Props) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const [loadMoreNodes, setLoadMoreNodes] = React.useState<React.JSX.Element[]>([]);
  const currentPageRef = React.useRef<number>(page);

  const loadMore = React.useCallback(
    async (abortController?: AbortController) => {
      loadMoreProposalsAction(spaceId, currentPageRef.current)
        .then(([node, next]) => {
          if (abortController?.signal.aborted) return;

          setLoadMoreNodes(prev => [...prev, node]);

          currentPageRef.current = next;
        })
        .catch(() => {});
    },
    [loadMoreProposalsAction]
  );

  React.useEffect(() => {
    const signal = new AbortController();

    const element = ref.current;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && element?.disabled === false) {
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
  }, [loadMore, ref.current]);

  return (
    <div>
      {loadMoreNodes}

      <SmallButton variant="secondary" ref={ref} onClick={() => loadMore()}>
        Load more
      </SmallButton>
    </div>
  );
}
