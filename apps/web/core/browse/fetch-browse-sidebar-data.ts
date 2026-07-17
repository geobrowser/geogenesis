import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { DOCUMENTATION_SPACE_ID, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces, getSpacesWhereMember } from '~/core/io/queries';
import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';
import { type FeaturedSpace, fetchFeaturedSpaces } from '~/core/io/subgraph/fetch-featured-spaces';
import {
  fetchPendingEditorshipSpaceIds,
  fetchPendingMembershipSpaceIds,
} from '~/core/io/subgraph/fetch-pending-membership-space-ids';
import { normId } from '~/core/utils/norm-id';
import { sortSpaceListByRankNameId } from '~/core/utils/space/browse-space-list-sort';

export type BrowseSpaceRow = {
  id: string;
  name: string;
  image: string | null;
  /** No entity name (same semantics as governance space filter); featured overrides still count as named. */
  unnamed?: boolean;
  pendingLabel?: 'Membership pending' | 'Editorship pending';
};

export type BrowseSidebarData = {
  featured: BrowseSpaceRow[];
  editorOf: BrowseSpaceRow[];
  memberOf: BrowseSpaceRow[];
  documentationImage: string | null;
  /** Personal space id used for membership/editor GraphQL (same as browse “member space”). */
  personalSpaceId: string | null;
};

function toBrowseSpaceRow(space: FeaturedSpace): BrowseSpaceRow {
  return {
    id: space.spaceId,
    name: space.name,
    image: space.image === PLACEHOLDER_SPACE_IMAGE ? null : space.image,
    unnamed: false,
  };
}

function featuredFallbackMap(featuredSpaces: FeaturedSpace[]): Map<string, BrowseSpaceRow> {
  return new Map(featuredSpaces.map(space => [normId(space.spaceId), toBrowseSpaceRow(space)]));
}

async function fetchSpaceRows(
  ids: string[],
  featuredFallbacks: Map<string, BrowseSpaceRow> = new Map()
): Promise<Map<string, BrowseSpaceRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const map = new Map<string, BrowseSpaceRow>();
  const result = await Effect.runPromise(Effect.either(getSpaces({ spaceIds: unique, limit: unique.length })));

  if (Either.isLeft(result)) {
    for (const id of unique) {
      const fallback = featuredFallbacks.get(normId(id));
      map.set(id, fallback ? { ...fallback, id } : { id, name: id.slice(0, 8), image: null, unnamed: true });
    }
    return map;
  }

  for (const space of result.right) {
    const rawName = space.entity.name?.trim() ?? '';
    const featuredFallback = featuredFallbacks.get(normId(space.id));
    const unnamed = rawName.length === 0 && !featuredFallback;
    const name = rawName || featuredFallback?.name || space.id.slice(0, 8);
    const resolvedImage =
      space.entity.image && space.entity.image !== PLACEHOLDER_SPACE_IMAGE
        ? space.entity.image
        : (featuredFallback?.image ?? null);
    map.set(space.id, {
      id: space.id,
      name,
      unnamed,
      image: resolvedImage,
    });
  }

  for (const id of unique) {
    if (!map.has(id)) {
      const fallback = featuredFallbacks.get(normId(id));
      map.set(id, fallback ? { ...fallback, id } : { id, name: id.slice(0, 8), image: null, unnamed: true });
    }
  }

  return map;
}

async function fetchBrowseSidebarSources(memberSpaceId: string) {
  const [editorIds, memberSpaces, pendingMemberIds, pendingEditorIds] = await Promise.all([
    fetchEditorSpaceIds(memberSpaceId),
    Effect.runPromise(getSpacesWhereMember(memberSpaceId)),
    fetchPendingMembershipSpaceIds(memberSpaceId).catch(() => [] as string[]),
    fetchPendingEditorshipSpaceIds(memberSpaceId).catch(() => [] as string[]),
  ]);

  return { editorIds, memberSpaces, pendingMemberIds, pendingEditorIds };
}

async function buildBrowseSidebarDataFromSources(
  memberSpaceId: string,
  { editorIds, memberSpaces, pendingMemberIds, pendingEditorIds }: BrowseSidebarSources,
  featuredSpaces: FeaturedSpace[]
): Promise<BrowseSidebarData> {
  const editorIdSet = new Set(editorIds);
  const pendingMemberIdSet = new Set(pendingMemberIds);
  const pendingEditorIdSet = new Set(pendingEditorIds);

  const memberOnlyIdSet = new Set(
    memberSpaces.map(s => s.id).filter(id => id !== memberSpaceId && !editorIdSet.has(id))
  );

  const editorOfIds = [...editorIdSet];
  for (const id of pendingEditorIdSet) {
    if (!editorIdSet.has(id)) editorOfIds.push(id);
  }

  const memberOfIdSet = new Set(memberOnlyIdSet);
  for (const id of pendingMemberIdSet) {
    if (!editorIdSet.has(id)) memberOfIdSet.add(id);
  }
  const memberOfIds = [...memberOfIdSet];

  const excludedFromFeatured = new Set(
    [memberSpaceId, ...editorIdSet, ...memberOnlyIdSet, ...pendingMemberIdSet, ...pendingEditorIdSet].map(normId)
  );
  const featured = featuredSpaces
    .filter(space => !excludedFromFeatured.has(normId(space.spaceId)))
    .map(toBrowseSpaceRow);

  const allIds = [...new Set([...editorOfIds, ...memberOfIds, DOCUMENTATION_SPACE_ID])];
  const rows = await fetchSpaceRows(allIds, featuredFallbackMap(featuredSpaces));

  const editorOf: BrowseSpaceRow[] = sortSpaceListByRankNameId(
    editorOfIds.map(id => {
      const base = rows.get(id)!;
      return pendingEditorIdSet.has(id) && !editorIdSet.has(id)
        ? { ...base, pendingLabel: 'Editorship pending' as const }
        : base;
    })
  );

  const memberOf: BrowseSpaceRow[] = sortSpaceListByRankNameId(
    memberOfIds.map(id => {
      const base = rows.get(id)!;
      return pendingMemberIdSet.has(id) && !memberOnlyIdSet.has(id)
        ? { ...base, pendingLabel: 'Membership pending' as const }
        : base;
    })
  );

  return {
    featured,
    editorOf,
    memberOf,
    documentationImage: rows.get(DOCUMENTATION_SPACE_ID)?.image ?? null,
    personalSpaceId: memberSpaceId,
  };
}

type BrowseSidebarSources = {
  editorIds: string[];
  memberSpaces: Space[];
  pendingMemberIds: string[];
  pendingEditorIds: string[];
};

type FeaturedSpacesSource = FeaturedSpace[] | PromiseLike<FeaturedSpace[]>;

/**
 * The optional source lets pages that also render the Explore Join-spaces panel
 * share its in-flight traversal rather than querying the Root topic tree twice.
 */
export async function fetchBrowseSidebarData(
  memberSpaceId: string | null | undefined,
  featuredSpacesSource?: FeaturedSpacesSource
): Promise<BrowseSidebarData> {
  const featuredSpacesPromise = featuredSpacesSource ? Promise.resolve(featuredSpacesSource) : fetchFeaturedSpaces();

  if (!memberSpaceId) {
    const [featuredSpaces, documentationRows] = await Promise.all([
      featuredSpacesPromise,
      fetchSpaceRows([DOCUMENTATION_SPACE_ID]),
    ]);
    return {
      featured: featuredSpaces.map(toBrowseSpaceRow),
      editorOf: [],
      memberOf: [],
      documentationImage: documentationRows.get(DOCUMENTATION_SPACE_ID)?.image ?? null,
      personalSpaceId: null,
    };
  }

  const [sources, featuredSpaces] = await Promise.all([
    fetchBrowseSidebarSources(memberSpaceId),
    featuredSpacesPromise,
  ]);
  return buildBrowseSidebarDataFromSources(memberSpaceId, sources, featuredSpaces);
}

export async function fetchBrowseSidebarDataWithMemberSpaces(
  memberSpaceId: string,
  featuredSpacesSource?: FeaturedSpacesSource
): Promise<{ sidebar: BrowseSidebarData; memberSpaces: Space[] }> {
  const [sources, featuredSpaces] = await Promise.all([
    fetchBrowseSidebarSources(memberSpaceId),
    featuredSpacesSource ? Promise.resolve(featuredSpacesSource) : fetchFeaturedSpaces(),
  ]);
  const sidebar = await buildBrowseSidebarDataFromSources(memberSpaceId, sources, featuredSpaces);
  return { sidebar, memberSpaces: sources.memberSpaces };
}
