'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchBrowseSidebarDataWithMemberSpaces, type BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import type { Space } from '~/core/io/dto/spaces';

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
  return useQuery({
    queryKey: ['query-from-spaces-sidebar-sections', memberSpaceId],
    enabled: Boolean(memberSpaceId) && enabled,
    queryFn: async (): Promise<QueryFromSpacesListData> => {
      if (!memberSpaceId) {
        return {
          sections: { editors: [], members: [], featured: [] },
          ordering: {
            editorIds: new Set(),
            memberIds: new Set(),
            featuredIds: new Set(),
            createdAtMs: new Map(),
          },
        };
      }

      const { sidebar, memberSpaces } = await fetchBrowseSidebarDataWithMemberSpaces(memberSpaceId);

      const editors = sidebar.editorOf.map(r => browseRowToQueryRow(r, 0));
      const members = sidebar.memberOf.map(r => browseRowToQueryRow(r, 1));
      const featured = sidebar.featured.map(r => browseRowToQueryRow(r, 2));

      const createdAtMs = new Map<string, number>();
      for (const s of memberSpaces) {
        createdAtMs.set(s.id, entityCreatedAtMs(s.entity));
      }

      const ordering: SpaceDropdownOrderingMeta = {
        editorIds: new Set(sidebar.editorOf.map(r => r.id)),
        memberIds: new Set(sidebar.memberOf.map(r => r.id)),
        featuredIds: new Set(sidebar.featured.map(r => r.id)),
        createdAtMs,
      };

      return {
        sections: { editors, members, featured },
        ordering,
      };
    },
    staleTime: 60_000,
  });
}
