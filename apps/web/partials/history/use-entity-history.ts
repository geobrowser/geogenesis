'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { fetchProfile, fetchProfileBySpaceId } from '~/core/io/subgraph';
import { type EntityVersion, fetchEntityVersions } from '~/core/io/subgraph/fetch-entity-versions';
import { validateWalletAddress } from '~/core/io/rest';
import type { Profile } from '~/core/types';

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

  const baseVersions = React.useMemo(() => versionPages?.pages.flat() ?? [], [versionPages]);

  // Editors the server couldn't resolve to a named profile — we only see the raw id.
  // Try to resolve those client-side so the history shows a name instead of an address.
  const unresolvedEditorIds = React.useMemo(() => {
    const ids = baseVersions.filter(v => v.createdById && !v.createdBy?.name).map(v => v.createdById as string);
    return [...new Set(ids)];
  }, [baseVersions]);

  const { data: resolvedProfiles } = useQuery({
    enabled: unresolvedEditorIds.length > 0,
    queryKey: ['entity-history-editor-profiles', unresolvedEditorIds],
    queryFn: () =>
      Effect.runPromise(
        Effect.all(
          unresolvedEditorIds.map(id => {
            // The id is either a wallet address or a personal space id depending on the version.
            const wallet = validateWalletAddress(id);
            return wallet ? fetchProfile(wallet) : fetchProfileBySpaceId(id);
          }),
          { concurrency: 'unbounded' }
        )
      ),
  });

  const profilesById = React.useMemo(() => {
    const map = new Map<string, Profile>();
    resolvedProfiles?.forEach((profile, index) => map.set(unresolvedEditorIds[index], profile));
    return map;
  }, [resolvedProfiles, unresolvedEditorIds]);

  const allVersions = React.useMemo(() => {
    return baseVersions.map(version => {
      if (version.createdBy?.name || !version.createdById) {
        return version;
      }

      const profile = profilesById.get(version.createdById);
      if (!profile?.name) {
        return version;
      }

      return {
        ...version,
        createdBy: {
          entityId: profile.id,
          spaceId: profile.spaceId,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          address: profile.address,
        },
      };
    });
  }, [baseVersions, profilesById]);

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
