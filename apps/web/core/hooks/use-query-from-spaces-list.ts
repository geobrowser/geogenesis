'use client';

import * as React from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { browseSidebarDataQueryKey } from '~/core/browse/browse-sidebar-query';
import { FEATURED_BROWSE_SPACES } from '~/core/browse/featured-spaces';
import {
  fetchBrowseSidebarData,
  type BrowseSidebarData,
  type BrowseSpaceRow,
} from '~/core/browse/fetch-browse-sidebar-data';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces, getSpacesWhereMember } from '~/core/io/queries';
import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';
import { sortSpaceListByRankNameId } from '~/core/utils/space/browse-space-list-sort';

export type QueryFromSpaceRow = {
  id: string;
  name: string;
  image: string | null;
  /** 0 = editor of, 1 = member of, 2 = top / featured spaces. */
  tier: 0 | 1 | 2 | 3;
  pendingLabel?: 'Membership pending' | 'Editorship pending';
};

/** Used to rank fuzzy-search hits the same way as the sectioned list. */
export type SpaceDropdownOrderingMeta = {
  editorIds: Set<string>;
  memberIds: Set<string>;
  featuredIds: Set<string>;
  createdAtMs: Map<string, number>;
};

export type ScopeDropdownSections = {
  editors: QueryFromSpaceRow[];
  members: QueryFromSpaceRow[];
  featured: QueryFromSpaceRow[];
};

export type QueryFromSpacesListData = {
  sections: ScopeDropdownSections;
  ordering: SpaceDropdownOrderingMeta;
};

function browseRowToQueryRow(row: BrowseSpaceRow, tier: 0 | 1 | 2): QueryFromSpaceRow {
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    tier,
    ...(row.pendingLabel ? { pendingLabel: row.pendingLabel } : {}),
  };
}

function spaceToBrowseRow(space: Space): BrowseSpaceRow {
  const rawName = space.entity.name?.trim() ?? '';
  const featuredFallback = FEATURED_BROWSE_SPACES.find(f => f.id === space.id)?.name;
  const unnamed = rawName.length === 0 && !featuredFallback;

  return {
    id: space.id,
    name: rawName || featuredFallback || space.id.slice(0, 8),
    unnamed,
    image: space.entity.image || null,
  };
}

function entityCreatedAtMs(entity: Space['entity'] | undefined): number {
  const raw = entity?.createdAt;
  if (raw === undefined || raw === null || raw === '') return Number.MAX_SAFE_INTEGER;
  if (typeof raw === 'number') {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  const trimmed = String(raw).trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) {
      return num < 1e12 ? num * 1000 : num;
    }
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

/** Rank search hits: editors → members → featured → everyone else (then name). */
export function sortSpacesForDropdownSearch(
  rows: Array<{ id: string; name: string; image: string | null }>,
  ordering: SpaceDropdownOrderingMeta
): QueryFromSpaceRow[] {
  function tierOf(id: string): 0 | 1 | 2 | 3 {
    if (ordering.editorIds.has(id)) return 0;
    if (ordering.memberIds.has(id)) return 1;
    if (ordering.featuredIds.has(id)) return 2;
    return 3;
  }

  const enriched: QueryFromSpaceRow[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    image: r.image,
    tier: tierOf(r.id),
  }));

  enriched.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const ca = ordering.createdAtMs.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const cb = ordering.createdAtMs.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return enriched;
}

/**
 * Spaces for “Query from”: same buckets as the browse sidebar — editor of, member of, top (featured) spaces only.
 * Use search for any other space. No bulk `spaces` GraphQL list.
 */
export function useQueryFromSpacesList(memberSpaceId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const canLoad = Boolean(memberSpaceId) && enabled;

  const cachedSidebar = memberSpaceId
    ? queryClient.getQueryData<BrowseSidebarData>(browseSidebarDataQueryKey(memberSpaceId))
    : undefined;

  const sidebarQuery = useQuery({
    queryKey: browseSidebarDataQueryKey(memberSpaceId),
    enabled: canLoad,
    initialData: cachedSidebar,
    queryFn: () => fetchBrowseSidebarData(memberSpaceId!),
    staleTime: 60_000,
  });

  const memberSpacesQuery = useQuery({
    queryKey: ['query-from-spaces-member-spaces', memberSpaceId],
    enabled: canLoad,
    queryFn: () => Effect.runPromise(getSpacesWhereMember(memberSpaceId!)),
    staleTime: 60_000,
  });

  const editorIdsQuery = useQuery({
    queryKey: ['query-from-spaces-editor-ids', memberSpaceId],
    enabled: canLoad,
    queryFn: () => fetchEditorSpaceIds(memberSpaceId!),
    staleTime: 60_000,
  });

  const editorRowsQuery = useQuery({
    queryKey: ['query-from-spaces-editor-rows', editorIdsQuery.data?.join(',') ?? ''],
    enabled: canLoad && Boolean(editorIdsQuery.data?.length),
    queryFn: async () => {
      const ids = editorIdsQuery.data ?? [];
      const spaces = await Effect.runPromise(getSpaces({ spaceIds: ids, limit: ids.length }));
      const rowsById = new Map(spaces.map(space => [space.id, spaceToBrowseRow(space)]));
      return sortSpaceListByRankNameId(
        ids.map(id => rowsById.get(id) ?? { id, name: id.slice(0, 8), image: null, unnamed: true })
      );
    },
    staleTime: 60_000,
  });

  const personalSpaceQuery = useQuery({
    queryKey: ['query-from-spaces-personal-row', memberSpaceId],
    enabled: canLoad,
    queryFn: async () => {
      const spaces = await Effect.runPromise(getSpaces({ spaceIds: [memberSpaceId!], limit: 1 }));
      const space = spaces.find(s => s.id === memberSpaceId);
      return space ? spaceToBrowseRow(space) : null;
    },
    staleTime: 60_000,
  });

  const data = React.useMemo<QueryFromSpacesListData>(() => {
    const sidebar = sidebarQuery.data;
    const editorIds = new Set(editorIdsQuery.data ?? sidebar?.editorOf.map(r => r.id) ?? []);
    const memberSpaces = memberSpacesQuery.data ?? [];
    const memberIds = new Set(sidebar?.memberOf.map(r => r.id) ?? memberSpaces.map(s => s.id));
    if (memberSpaceId) memberIds.add(memberSpaceId);
    const excludedFeaturedIds = new Set([...editorIds, ...memberIds]);

    const sidebarFeaturedRows = sidebar?.featured.length
      ? sidebar.featured
      : FEATURED_BROWSE_SPACES.map(row => ({ ...row, image: null, unnamed: false }));
    const featuredRows = sidebarFeaturedRows.filter(row => !excludedFeaturedIds.has(row.id));

    const editorRows = sidebar?.editorOf ?? editorRowsQuery.data ?? [];
    const personalRow =
      personalSpaceQuery.data ?? (memberSpaceId ? memberSpaces.find(s => s.id === memberSpaceId) : undefined);
    const personalBrowseRow =
      personalRow && 'entity' in personalRow ? spaceToBrowseRow(personalRow) : (personalRow ?? null);

    const memberRowsBase =
      sidebar?.memberOf ??
      sortSpaceListByRankNameId(memberSpaces.filter(space => !editorIds.has(space.id)).map(spaceToBrowseRow));
    const memberRows =
      personalBrowseRow &&
      !editorRows.some(row => row.id === personalBrowseRow.id) &&
      !memberRowsBase.some(row => row.id === personalBrowseRow.id)
        ? [personalBrowseRow, ...memberRowsBase]
        : memberRowsBase;

    const createdAtMs = new Map<string, number>();
    for (const s of memberSpaces) {
      createdAtMs.set(s.id, entityCreatedAtMs(s.entity));
    }

    return {
      sections: {
        editors: editorRows.map(r => browseRowToQueryRow(r, 0)),
        members: memberRows.map(r => browseRowToQueryRow(r, 1)),
        featured: featuredRows.map(r => browseRowToQueryRow(r, 2)),
      },
      ordering: {
        editorIds: new Set(editorRows.map(r => r.id)),
        memberIds: new Set(memberRows.map(r => r.id)),
        featuredIds: new Set(featuredRows.map(r => r.id)),
        createdAtMs,
      },
    };
  }, [
    editorIdsQuery.data,
    editorRowsQuery.data,
    memberSpaceId,
    memberSpacesQuery.data,
    personalSpaceQuery.data,
    sidebarQuery.data,
  ]);

  const isLoading =
    canLoad &&
    (sidebarQuery.isLoading ||
      memberSpacesQuery.isLoading ||
      editorIdsQuery.isLoading ||
      editorRowsQuery.isLoading ||
      personalSpaceQuery.isLoading);

  return {
    data,
    isLoading,
  };
}
