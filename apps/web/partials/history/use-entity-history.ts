'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';

import * as React from 'react';

import { type EntityVersion, fetchEntityVersions } from '~/core/io/subgraph/fetch-entity-versions';

import type { HistoryDiffSelection } from './history-diff-slide-up';

const PAGE_SIZE = 10;

interface UseEntityHistoryArgs {
  entityId: string;
  spaceId: string;
  enabled: boolean;
}

export function useEntityHistory({ entityId, spaceId, enabled }: UseEntityHistoryArgs) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

      // Reflect selected version in URL for easy inspection
      const newParams = new URLSearchParams(searchParams?.toString());
      if (nextVersion?.editId) {
        newParams.set('fromEditId', nextVersion.editId);
      } else {
        newParams.delete('fromEditId');
      }
      newParams.set('toEditId', version.editId);
      const queryString = newParams.toString();
      window.history.replaceState(null, '', `${pathname}${queryString ? `?${queryString}` : ''}`);
    },
    [allVersions, entityId, spaceId, pathname, searchParams]
  );

  const clearDiffSelection = React.useCallback(() => {
    setDiffSelection(null);

    // Remove version params from URL
    const newParams = new URLSearchParams(searchParams?.toString());
    newParams.delete('toEditId');
    newParams.delete('fromEditId');
    const queryString = newParams.toString();
    window.history.replaceState(null, '', `${pathname}${queryString ? `?${queryString}` : ''}`);
  }, [pathname, searchParams]);

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
