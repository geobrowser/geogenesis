'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { fetchEntityVersions, type EntityVersion } from '~/core/io/subgraph/fetch-entity-versions';

import type { HistoryDiffSelection } from './history-diff-slide-up';

const PAGE_SIZE = 10;

interface UseEntityHistoryArgs {
  entityId: string;
  spaceId: string;
  enabled: boolean;
}

export function useEntityHistory({ entityId, spaceId, enabled }: UseEntityHistoryArgs) {
  const [diffSelection, setDiffSelection] = React.useState<HistoryDiffSelection | null>(null);

  const {
    data: versionPages,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    enabled,
    queryKey: [`entity-versions-rest-${entityId}`],
    queryFn: ({ signal, pageParam = 0 }) =>
      fetchEntityVersions({ entityId, limit: PAGE_SIZE, offset: pageParam * PAGE_SIZE, signal }),
    getNextPageParam: (lastPage, pages) => (lastPage.length === PAGE_SIZE ? pages.length : undefined),
    initialPageParam: 0,
  });

  const allVersions = React.useMemo(() => versionPages?.pages.flat() ?? [], [versionPages]);

  const onVersionClick = React.useCallback(
    (version: EntityVersion, index: number) => {
      const nextVersion = allVersions[index + 1];

      const date = new Date(version.createdAt);
      const dateLabel = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
      const label = version.name ?? `Changes from ${dateLabel}`;

      setDiffSelection({
        entityId,
        spaceId,
        fromEditId: nextVersion?.editId,
        toEditId: version.editId,
        label,
      });
    },
    [allVersions, entityId, spaceId]
  );

  const clearDiffSelection = React.useCallback(() => setDiffSelection(null), []);

  return {
    allVersions,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    diffSelection,
    onVersionClick,
    clearDiffSelection,
  };
}
