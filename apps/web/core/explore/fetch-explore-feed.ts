import * as Effect from 'effect/Effect';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { EntitiesOrderBy, type EntityFilter, type UuidFilter } from '~/core/gql/graphql';
import { EntityDecoder } from '~/core/io/decoders/entity';
import { graphql } from '~/core/io/graphql-client';
import { hasActiveMemberProposal } from '~/core/io/subgraph/fetch-proposed-members';
import { fetchProfile } from '~/core/io/subgraph';
import type { Entity } from '~/core/types';

import {
  EXPLORE_AVATAR_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
  EXPLORE_ENTITY_TYPE_IDS,
  EXPLORE_PAGE_SIZE,
} from './explore-constants';
import { exploreEntitiesConnectionDocument } from './explore-entities-document';
import { parseEntityUpdatedAtToUnixSec } from './explore-relative-time';

export type ExploreSort = 'new';
export type ExploreTime = 'today' | 'week' | 'month' | 'year' | 'all';

export type ExploreFeedItem = {
  entityId: string;
  spaceId: string;
  spaceName: string;
  spaceImage: string | null;
  types: { id: string; name: string | null }[];
  updatedAtSec: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  commentCount: number;
  isMemberOrEditor: boolean;
  hasPendingMembershipRequest: boolean;
};

export type ExploreFeedResult = {
  items: ExploreFeedItem[];
  nextCursor: string | null;
};

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

const TYPE_SET = new Set(EXPLORE_ENTITY_TYPE_IDS.map(id => normId(id)));

function timeThresholdSec(filter: ExploreTime): number | null {
  const now = Math.floor(Date.now() / 1000);
  switch (filter) {
    case 'today':
      return now - 86400;
    case 'week':
      return now - 7 * 86400;
    case 'month':
      return now - 30 * 86400;
    case 'year':
      return now - 365 * 86400;
    case 'all':
    default:
      return null;
  }
}

function pickDisplaySpaceId(entity: Entity, allowed: Set<string>): string | null {
  for (const sid of entity.spaces) {
    if (allowed.has(normId(sid))) return sid;
  }
  return entity.spaces[0] ?? null;
}

function textValueForProperty(entity: Entity, propertyId: string, spaceId: string): string | null {
  const pid = normId(propertyId);
  const sid = normId(spaceId);
  const row = entity.values.find(v => normId(v.property.id) === pid && normId(v.spaceId) === sid);
  if (!row?.value) return null;
  const t = row.value.trim();
  return t.length ? t : null;
}

function imageFromRelationMedia(relations: Entity['relations'], spaceId: string): string | null {
  if (!relations?.length) return null;
  const sid = normId(spaceId);
  const coverT = normId(SystemIds.COVER_PROPERTY);
  const avatarT = normId(ContentIds.AVATAR_PROPERTY);
  const pool = relations.filter(r => normId(r.spaceId) === sid);
  const scan = pool.length ? pool : relations;
  for (const r of scan) {
    if (normId(r.type.id) === coverT && r.toEntity.value) {
      const v = r.toEntity.value.trim();
      if (v) return v;
    }
  }
  for (const r of scan) {
    if (normId(r.type.id) === avatarT && r.toEntity.value) {
      const v = r.toEntity.value.trim();
      if (v) return v;
    }
  }
  return null;
}

function imageFromEntity(entity: Entity, spaceId: string): string | null {
  const cover = textValueForProperty(entity, EXPLORE_COVER_PROPERTY_ID, spaceId);
  if (cover) return cover;
  const av = textValueForProperty(entity, EXPLORE_AVATAR_PROPERTY_ID, spaceId);
  if (av) return av;
  return imageFromRelationMedia(entity.relations, spaceId);
}

function entityMatchesExploreTypes(entity: Entity): boolean {
  return entity.types.some(t => TYPE_SET.has(normId(t.id)));
}

type ExploreEntity = Entity & { commentCount: number; createdAt?: string };

type ExploreEntitiesPageResponse = {
  entities: ExploreEntity[];
  endCursor: string | null;
  hasNextPage: boolean;
};

function decodeExploreEntities(data: {
  entitiesConnection?: {
    nodes?: unknown[];
    pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
  } | null;
}): ExploreEntitiesPageResponse {
  const entities: ExploreEntity[] = [];
  for (const n of (data.entitiesConnection?.nodes ?? []) as Array<
    Record<string, unknown> & { backlinks?: { totalCount?: number } | null; createdAt?: string }
  >) {
    const decoded = EntityDecoder.decode(n);
    if (!decoded) continue;
    entities.push({
      ...decoded,
      commentCount: n.backlinks?.totalCount ?? 0,
      createdAt: n.createdAt,
    });
  }
  return {
    entities,
    endCursor: data.entitiesConnection?.pageInfo?.endCursor ?? null,
    hasNextPage: data.entitiesConnection?.pageInfo?.hasNextPage ?? false,
  };
}

async function fetchExploreEntitiesPage(args: {
  spaceIds: string[];
  time: ExploreTime;
  limit: number;
  after: string | null;
  orderBy: EntitiesOrderBy[];
}): Promise<ExploreEntitiesPageResponse> {
  const t = timeThresholdSec(args.time);
  const filter: EntityFilter = {
    typeIds: { overlaps: [...EXPLORE_ENTITY_TYPE_IDS] },
    ...(t != null ? { createdAt: { greaterThanOrEqualTo: String(t) } } : {}),
  };

  return Effect.runPromise(
    graphql({
      query: exploreEntitiesConnectionDocument,
      decoder: decodeExploreEntities,
      variables: {
        spaceIds: { in: args.spaceIds } as UuidFilter,
        limit: args.limit,
        after: args.after,
        filter,
        orderBy: args.orderBy,
        spaceIdsForLists: args.spaceIds,
      },
    })
  );
}

function buildItems(
  entities: ExploreEntity[],
  allowedSpaceIds: Set<string>,
  memberOrEditorSpaceIds: Set<string>
): Omit<ExploreFeedItem, 'spaceName' | 'spaceImage' | 'hasPendingMembershipRequest'>[] {
  const items: Omit<ExploreFeedItem, 'spaceName' | 'spaceImage' | 'hasPendingMembershipRequest'>[] = [];

  for (const e of entities) {
    const spaceId = pickDisplaySpaceId(e, allowedSpaceIds);
    if (!spaceId || !entityMatchesExploreTypes(e)) continue;

    const title =
      textValueForProperty(e, EXPLORE_ENTITY_NAME_PROPERTY_ID, spaceId) ?? e.name?.trim() ?? 'Untitled';
    const description =
      textValueForProperty(e, EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID, spaceId) ?? e.description ?? null;

    items.push({
      entityId: e.id,
      spaceId,
      types: e.types.map(t => ({ id: t.id, name: t.name })),
      updatedAtSec: parseEntityUpdatedAtToUnixSec(e.createdAt),
      title,
      description,
      imageUrl: imageFromEntity(e, spaceId),
      commentCount: e.commentCount,
      isMemberOrEditor: memberOrEditorSpaceIds.has(normId(spaceId)),
    });
  }

  return items;
}

function browseSpaceRowsToMap(data: BrowseSidebarData): Map<string, { name: string; image: string | null }> {
  const m = new Map<string, { name: string; image: string | null }>();
  const add = (row: { id: string; name: string; image: string | null }) => {
    m.set(normId(row.id), { name: row.name, image: row.image });
  };
  for (const row of data.featured) add(row);
  for (const row of data.editorOf) add(row);
  for (const row of data.memberOf) add(row);
  return m;
}

export async function fetchExploreFeed(args: {
  browse: BrowseSidebarData;
  sort: ExploreSort;
  time: ExploreTime;
  spaceFilterId: string | null;
  cursor: string | null;
  walletAddress?: string | null;
  memberOrEditorSpaceIds: string[];
}): Promise<ExploreFeedResult> {
  const spaceMeta = browseSpaceRowsToMap(args.browse);
  const baseIds = [...new Set([...spaceMeta.keys()].map(normId))].filter(id =>
    args.spaceFilterId ? id === normId(args.spaceFilterId) : true
  );
  if (baseIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const allowed = new Set(baseIds);
  const memberOrEditorSet = new Set(args.memberOrEditorSpaceIds.map(normId));

  const pageSize = EXPLORE_PAGE_SIZE;
  const scanChunk = 30;

  const attachMeta = async (
    rows: Omit<ExploreFeedItem, 'spaceName' | 'spaceImage' | 'hasPendingMembershipRequest'>[]
  ): Promise<ExploreFeedItem[]> => {
    const out: ExploreFeedItem[] = rows.map(r => ({
      ...r,
      spaceName: spaceMeta.get(normId(r.spaceId))?.name ?? r.spaceId.slice(0, 8),
      spaceImage: spaceMeta.get(normId(r.spaceId))?.image ?? null,
      hasPendingMembershipRequest: false,
    }));

    const wallet = args.walletAddress;
    if (!wallet) return out;

    const pendingTargets = [...new Set(out.filter(o => !o.isMemberOrEditor).map(o => o.spaceId))];
    if (pendingTargets.length === 0) return out;

    try {
      const profile = await Effect.runPromise(fetchProfile(wallet));
      const memberSpaceId = profile?.spaceId;
      if (!memberSpaceId) return out;

      const pendingMap = new Map<string, boolean>();
      await Promise.all(
        pendingTargets.map(async sid => {
          try {
            const p = await hasActiveMemberProposal(sid, memberSpaceId);
            pendingMap.set(normId(sid), p);
          } catch {
            pendingMap.set(normId(sid), false);
          }
        })
      );

      for (const row of out) {
        if (!row.isMemberOrEditor) {
          row.hasPendingMembershipRequest = pendingMap.get(normId(row.spaceId)) ?? false;
        }
      }
    } catch {
      /* Profile / membership checks must not drop the whole feed when subgraph is flaky. */
    }
    return out;
  };

  const page = await fetchExploreEntitiesPage({
    spaceIds: baseIds,
    time: args.time,
    limit: scanChunk,
    after: args.cursor,
    orderBy: [EntitiesOrderBy.CreatedAtDesc],
  });

  const enriched = buildItems(page.entities, allowed, memberOrEditorSet);
  const items = await attachMeta(enriched.slice(0, pageSize));

  const nextCursor = page.hasNextPage ? page.endCursor : null;

  return { items, nextCursor };
}
