import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { DOCUMENTATION_SPACE_ID, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { getSpaces, getSpacesWhereMember } from '~/core/io/queries';
import { graphql } from '~/core/io/subgraph/graphql';

import { fetchEditorSpaceIds } from '~/core/io/subgraph/fetch-editor-space-ids';

import { FEATURED_BROWSE_SPACES } from './featured-spaces';

export type BrowseSpaceRow = {
  id: string;
  name: string;
  image: string | null;
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

async function fetchSpaceRows(ids: string[]): Promise<Map<string, BrowseSpaceRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const map = new Map<string, BrowseSpaceRow>();
  const result = await Effect.runPromise(
    Effect.either(getSpaces({ spaceIds: unique, limit: unique.length }))
  );

  if (Either.isLeft(result)) {
    for (const id of unique) {
      map.set(id, { id, name: id.slice(0, 8), image: null });
    }
    return map;
  }

  for (const space of result.right) {
    map.set(space.id, {
      id: space.id,
      name:
        space.entity.name?.trim() ||
        FEATURED_BROWSE_SPACES.find(f => f.id === space.id)?.name ||
        space.id.slice(0, 8),
      image:
        space.entity.image && space.entity.image !== PLACEHOLDER_SPACE_IMAGE
          ? space.entity.image
          : null,
    });
  }

  for (const id of unique) {
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: FEATURED_BROWSE_SPACES.find(f => f.id === id)?.name ?? id.slice(0, 8),
        image: null,
      });
    }
  }

  return map;
}

type PendingSpaceIdsResult = {
  pendingMember: { nodes: { spaceId: string }[] };
  pendingEditor: { nodes: { spaceId: string }[] };
};

function pendingSpaceIdsQuery(memberSpaceId: string, nowSec: string): string {
  return `query {
    pendingMember: proposalsConnection(
      first: 100
      filter: {
        executedAt: { isNull: true }
        endTime: { greaterThanOrEqualTo: "${nowSec}" }
        proposalActionsConnection: {
          some: {
            actionType: { is: ADD_MEMBER }
            targetId: { is: "${memberSpaceId}" }
          }
        }
      }
    ) {
      nodes { spaceId }
    }
    pendingEditor: proposalsConnection(
      first: 100
      filter: {
        executedAt: { isNull: true }
        endTime: { greaterThanOrEqualTo: "${nowSec}" }
        proposalActionsConnection: {
          some: {
            actionType: { is: ADD_EDITOR }
            targetId: { is: "${memberSpaceId}" }
          }
        }
      }
    ) {
      nodes { spaceId }
    }
  }`;
}

export async function fetchBrowseSidebarData(memberSpaceId: string | null | undefined): Promise<BrowseSidebarData> {
  if (!memberSpaceId) {
    const featuredOnly = await fetchSpaceRows([
      ...FEATURED_BROWSE_SPACES.map(s => s.id),
      DOCUMENTATION_SPACE_ID,
    ]);
    return {
      featured: FEATURED_BROWSE_SPACES.map(f => {
        const row = featuredOnly.get(f.id);
        return row ?? { id: f.id, name: f.name, image: null };
      }),
      editorOf: [],
      memberOf: [],
      documentationImage: featuredOnly.get(DOCUMENTATION_SPACE_ID)?.image ?? null,
      personalSpaceId: null,
    };
  }

  const nowSec = String(Math.floor(Date.now() / 1000));

  const [editorIds, memberSpaces, pendingResult] = await Promise.all([
    fetchEditorSpaceIds(memberSpaceId),
    Effect.runPromise(getSpacesWhereMember(memberSpaceId)),
    Effect.runPromise(
      Effect.either(
        graphql<PendingSpaceIdsResult>({
          endpoint: Environment.getConfig().api,
          query: pendingSpaceIdsQuery(memberSpaceId, nowSec),
        })
      )
    ),
  ]);

  const editorIdSet = new Set(editorIds);
  const pendingMemberIds = new Set<string>();
  const pendingEditorIds = new Set<string>();

  if (Either.isRight(pendingResult)) {
    for (const n of pendingResult.right.pendingMember?.nodes ?? []) {
      pendingMemberIds.add(n.spaceId);
    }
    for (const n of pendingResult.right.pendingEditor?.nodes ?? []) {
      pendingEditorIds.add(n.spaceId);
    }
  }

  const memberOnlyIdSet = new Set(
    memberSpaces.map(s => s.id).filter(id => id !== memberSpaceId && !editorIdSet.has(id))
  );

  const editorOfIds = [...editorIdSet];
  for (const id of pendingEditorIds) {
    if (!editorIdSet.has(id)) editorOfIds.push(id);
  }

  const memberOfIdSet = new Set(memberOnlyIdSet);
  for (const id of pendingMemberIds) {
    if (!editorIdSet.has(id)) memberOfIdSet.add(id);
  }
  const memberOfIds = [...memberOfIdSet];

  const excludedFromFeatured = new Set<string>([
    ...editorIdSet,
    ...memberOnlyIdSet,
    ...pendingMemberIds,
    ...pendingEditorIds,
  ]);

  const featuredIds = FEATURED_BROWSE_SPACES.map(f => f.id).filter(id => !excludedFromFeatured.has(id));

  const allIds = [...new Set([...featuredIds, ...editorOfIds, ...memberOfIds, DOCUMENTATION_SPACE_ID])];
  const rows = await fetchSpaceRows(allIds);

  const featured: BrowseSpaceRow[] = featuredIds.map(id => {
    const base = rows.get(id)!;
    return { ...base, name: FEATURED_BROWSE_SPACES.find(f => f.id === id)?.name ?? base.name };
  });

  const editorOf: BrowseSpaceRow[] = editorOfIds.map(id => {
    const base = rows.get(id)!;
    return pendingEditorIds.has(id) && !editorIdSet.has(id)
      ? { ...base, pendingLabel: 'Editorship pending' as const }
      : base;
  });

  const memberOf: BrowseSpaceRow[] = memberOfIds.map(id => {
    const base = rows.get(id)!;
    return pendingMemberIds.has(id) && !memberOnlyIdSet.has(id)
      ? { ...base, pendingLabel: 'Membership pending' as const }
      : base;
  });

  return {
    featured,
    editorOf,
    memberOf,
    documentationImage: rows.get(DOCUMENTATION_SPACE_ID)?.image ?? null,
    personalSpaceId: memberSpaceId,
  };
}
