'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { fetchBrowseSidebarDataWithMemberSpaces, type BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';

export type QueryFromSpaceRow = {
  id: string;
  name: string;
  image: string | null;
  /**
   * Mirrors browse sidebar sections, then “everyone else”:
   * 0 = featured, 1 = editor of, 2 = member of, 3 = other (`createdAt` oldest first).
   */
  tier: 0 | 1 | 2 | 3;
};

function spaceDisplayName(s: Space): string {
  return s.entity?.name?.trim() || 'Untitled space';
}

function spaceImage(s: Space): string | null {
  return s.entity?.image ?? null;
}

function browseRowToQueryRow(row: BrowseSpaceRow, tier: 0 | 1 | 2): QueryFromSpaceRow {
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    tier,
  };
}

/** GraphQL `first` max for `spaces` list. */
const SPACE_PAGE_SIZE = 1000;

/**
 * Geo GraphQL rejects `spaces(..., offset: N)` when N is greater than 1000, so only two windows are valid:
 * offset 0 and offset 1000 (each with `first: 1000`). More spaces are reachable via search.
 */
const SPACES_MAX_OFFSET = 1000;

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

async function fetchSpacesWithinApiOffsetLimit(): Promise<Space[]> {
  /** Sequential pages avoid stacking two huge `spaces` responses alongside other GraphQL traffic. */
  const first = await Effect.runPromise(getSpaces({ limit: SPACE_PAGE_SIZE, offset: 0 }));
  const second = await Effect.runPromise(getSpaces({ limit: SPACE_PAGE_SIZE, offset: SPACES_MAX_OFFSET }));
  return [...first, ...second];
}

/**
 * Spaces for “query from” scope UI: same ordering as the browse sidebar (featured → editor of → member of),
 * then up to 2000 non-sidebar spaces from `spaces` (API offset cap), oldest `createdAt` first; use search for more.
 */
export function useQueryFromSpacesList(memberSpaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['query-from-spaces-ordered', memberSpaceId],
    enabled: Boolean(memberSpaceId) && enabled,
    queryFn: async (): Promise<QueryFromSpaceRow[]> => {
      if (!memberSpaceId) return [];

      const { sidebar, memberSpaces } = await fetchBrowseSidebarDataWithMemberSpaces(memberSpaceId);
      const allSpacesPages = await fetchSpacesWithinApiOffsetLimit();

      const shownIds = new Set<string>();
      const ordered: QueryFromSpaceRow[] = [];

      const pushSection = (rows: BrowseSpaceRow[], tier: 0 | 1 | 2) => {
        for (const r of rows) {
          if (shownIds.has(r.id)) continue;
          shownIds.add(r.id);
          ordered.push(browseRowToQueryRow(r, tier));
        }
      };

      pushSection(sidebar.featured, 0);
      pushSection(sidebar.editorOf, 1);
      pushSection(sidebar.memberOf, 2);

      const byId = new Map<string, Space>();
      for (const s of allSpacesPages) byId.set(s.id, s);
      for (const s of memberSpaces) byId.set(s.id, s);

      const otherRows: QueryFromSpaceRow[] = [];
      for (const s of byId.values()) {
        if (shownIds.has(s.id)) continue;
        otherRows.push({
          id: s.id,
          name: spaceDisplayName(s),
          image: spaceImage(s),
          tier: 3,
        });
      }

      otherRows.sort((a, b) => {
        const sa = byId.get(a.id);
        const sb = byId.get(b.id);
        const t1 = entityCreatedAtMs(sa?.entity);
        const t2 = entityCreatedAtMs(sb?.entity);
        if (t1 !== t2) return t1 - t2;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      return [...ordered, ...otherRows];
    },
    staleTime: 60_000,
  });
}
