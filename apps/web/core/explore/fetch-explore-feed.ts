import * as Effect from 'effect/Effect';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { COMMENT_REPLY_TO_ID, COMMENT_TYPE_ID } from '~/core/comment-ids';
import {
  EntitiesOrderBy,
  type EntityFilter,
  type GlobalScoreFilter,
  type UuidFilter,
} from '~/core/gql/graphql';
import { EntityDecoder } from '~/core/io/decoders/entity';
import { graphql } from '~/core/io/graphql-client';
import { getAllEntities, getEntity, getEntityVoteCount } from '~/core/io/queries';
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
import { exploreGlobalScoresDocument } from './global-scores-document';
import { isExploreNewPost, parseEntityUpdatedAtToUnixSec } from './explore-relative-time';

export type ExploreSort = 'new' | 'top' | 'controversial';
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
  upvotes: number;
  downvotes: number;
  commentCount: number;
  isMemberOrEditor: boolean;
  hasPendingMembershipRequest: boolean;
  /** True when last edit is recent (see EXPLORE_NEW_POST_MAX_AGE_SEC). */
  isNewPost: boolean;
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

async function countCommentsForEntity(entityId: string): Promise<number> {
  const list = await Effect.runPromise(
    getAllEntities({
      typeIds: { in: [COMMENT_TYPE_ID] },
      filter: {
        relations: {
          some: {
            toEntityId: { is: entityId },
            typeId: { is: COMMENT_REPLY_TO_ID },
          },
        },
      },
      limit: 1000,
    })
  );
  return list.length;
}

function decodeExploreEntities(data: { entitiesConnection?: { nodes?: unknown[] } | null }): Entity[] {
  return (
    data.entitiesConnection?.nodes
      ?.map((n: unknown) => EntityDecoder.decode(n))
      .filter((e): e is Entity => e !== null) ?? []
  );
}

async function fetchExploreEntitiesPage(args: {
  spaceIds: string[];
  time: ExploreTime;
  limit: number;
  offset: number;
  orderBy: EntitiesOrderBy[];
}): Promise<Entity[]> {
  const t = timeThresholdSec(args.time);
  const filter: EntityFilter = {
    ...(t != null ? { updatedAt: { greaterThanOrEqualTo: String(t) } } : {}),
  };

  return Effect.runPromise(
    graphql({
      query: exploreEntitiesConnectionDocument,
      decoder: decodeExploreEntities,
      variables: {
        spaceIds: { in: args.spaceIds } as UuidFilter,
        typeIds: { overlaps: [...EXPLORE_ENTITY_TYPE_IDS] } as UuidFilter,
        limit: args.limit,
        offset: args.offset,
        filter,
        orderBy: args.orderBy,
        spaceIdsForLists: args.spaceIds,
      },
    })
  );
}

async function enrichItems(
  entities: Entity[],
  allowedSpaceIds: Set<string>,
  memberOrEditorSpaceIds: Set<string>
): Promise<Omit<ExploreFeedItem, 'spaceName' | 'spaceImage' | 'hasPendingMembershipRequest'>[]> {
  const votePairs = await Promise.all(
    entities.map(async e => {
      try {
        const v = await Effect.runPromise(getEntityVoteCount(e.id, 0));
        return { e, v };
      } catch {
        return { e, v: null };
      }
    })
  );

  const withVotes = votePairs.filter(({ v }) => v != null && v.upvotes >= 1);
  const commentCounts = await Promise.all(
    withVotes.map(async ({ e }) => {
      try {
        const c = await countCommentsForEntity(e.id);
        return { e, c };
      } catch {
        return { e, c: 0 };
      }
    })
  );

  const items: Omit<ExploreFeedItem, 'spaceName' | 'spaceImage' | 'hasPendingMembershipRequest'>[] = [];

  for (const { e, v } of withVotes) {
    const spaceId = pickDisplaySpaceId(e, allowedSpaceIds);
    if (!spaceId || !entityMatchesExploreTypes(e)) continue;

    const cc = commentCounts.find(x => normId(x.e.id) === normId(e.id))?.c ?? 0;
    const title =
      textValueForProperty(e, EXPLORE_ENTITY_NAME_PROPERTY_ID, spaceId) ?? e.name?.trim() ?? 'Untitled';
    const description =
      textValueForProperty(e, EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID, spaceId) ?? e.description ?? null;

    const updatedAtSec = parseEntityUpdatedAtToUnixSec(e.updatedAt);
    items.push({
      entityId: e.id,
      spaceId,
      types: e.types.filter(t => TYPE_SET.has(normId(t.id))).map(t => ({ id: t.id, name: t.name })),
      updatedAtSec,
      title,
      description,
      imageUrl: imageFromEntity(e, spaceId),
      upvotes: v!.upvotes,
      downvotes: v!.downvotes,
      commentCount: cc,
      isMemberOrEditor: memberOrEditorSpaceIds.has(normId(spaceId)),
      isNewPost: isExploreNewPost(updatedAtSec),
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

async function hydrateEntitiesForSpace(entities: Entity[], allowed: Set<string>): Promise<Entity[]> {
  return Promise.all(
    entities.map(async e => {
      const sid = pickDisplaySpaceId(e, allowed);
      if (!sid) return e;
      const full = await Effect.runPromise(getEntity(e.id, sid));
      return full ?? e;
    })
  );
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

  const cursorOffset = args.cursor ? parseInt(args.cursor, 10) : 0;
  if (args.cursor != null && Number.isNaN(cursorOffset)) {
    return { items: [], nextCursor: null };
  }

  const pageSize = EXPLORE_PAGE_SIZE;
  const scanChunk = 55;

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

  if (args.sort === 'top') {
    const filter: GlobalScoreFilter = {
      score: { greaterThanOrEqualTo: 1 },
    };
    let scoreRows: { entityId: string; score: string }[] = [];
    try {
      scoreRows = await Effect.runPromise(
        graphql({
          query: exploreGlobalScoresDocument,
          decoder: (data: { globalScoresConnection?: { nodes?: { entityId: string; score: string }[] } | null }) =>
            data.globalScoresConnection?.nodes ?? [],
          variables: { first: scanChunk, offset: cursorOffset, filter },
        })
      );
    } catch {
      scoreRows = [];
    }

    if (scoreRows.length === 0) {
      /** Global score index empty or unavailable — fall back to entity scan + sort by votes (same pool as New). */
      const fbEntities = await fetchExploreEntitiesPage({
        spaceIds: baseIds,
        time: args.time,
        limit: scanChunk,
        offset: cursorOffset,
        orderBy: [EntitiesOrderBy.UpdatedAtDesc],
      });
      const fbHydrated = await hydrateEntitiesForSpace(fbEntities, allowed);
      const fbEnriched = await enrichItems(fbHydrated, allowed, memberOrEditorSet);
      fbEnriched.sort((a, b) => b.upvotes - a.upvotes || b.updatedAtSec - a.updatedAtSec);
      const fbItems = await attachMeta(fbEnriched.slice(0, pageSize));
      const fbNextOffset = cursorOffset + fbEntities.length;
      const fbNextCursor = fbEntities.length < scanChunk ? null : String(fbNextOffset);
      return { items: fbItems, nextCursor: fbNextCursor };
    }

    const entityIds = scoreRows.map(r => r.entityId);
    const entities = await Effect.runPromise(
      getAllEntities({
        filter: { id: { in: entityIds } },
        limit: entityIds.length,
      })
    );
    const byId = new Map(entities.map(e => [normId(e.id), e]));

    const ordered: Entity[] = [];
    for (const row of scoreRows) {
      const e = byId.get(normId(row.entityId));
      if (e) ordered.push(e);
    }

    const filtered: Entity[] = [];
    const t = timeThresholdSec(args.time);
    for (const e of ordered) {
      if (!entityMatchesExploreTypes(e)) continue;
      const sid = pickDisplaySpaceId(e, allowed);
      if (!sid) continue;
      if (t != null) {
        const u = parseEntityUpdatedAtToUnixSec(e.updatedAt);
        if (u < t) continue;
      }
      filtered.push(e);
    }

    const hydrated = await hydrateEntitiesForSpace(filtered.slice(0, pageSize * 2), allowed);
    const enriched = await enrichItems(hydrated, allowed, memberOrEditorSet);
    enriched.sort((a, b) => b.upvotes - a.upvotes || b.updatedAtSec - a.updatedAtSec);

    const items = await attachMeta(enriched.slice(0, pageSize));

    const nextOffset = cursorOffset + scoreRows.length;
    const nextCursor = scoreRows.length < scanChunk ? null : String(nextOffset);

    return { items, nextCursor };
  }

  const entities = await fetchExploreEntitiesPage({
    spaceIds: baseIds,
    time: args.time,
    limit: scanChunk,
    offset: cursorOffset,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
  });

  let enriched = await enrichItems(entities, allowed, memberOrEditorSet);

  if (args.sort === 'controversial') {
    enriched = [...enriched].sort(
      (a, b) => b.commentCount - a.commentCount || b.updatedAtSec - a.updatedAtSec
    );
  }

  const items = await attachMeta(enriched.slice(0, pageSize));

  const nextOffset = cursorOffset + entities.length;
  const nextCursor = entities.length < scanChunk ? null : String(nextOffset);

  return { items, nextCursor };
}
