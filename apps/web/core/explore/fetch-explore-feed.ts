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
  EXPLORE_PAGE_SIZE,
  SCORE_API_STAGING_URL_TEMP,
} from './explore-constants';
import { exploreEntitiesByScoreConnectionDocument } from './explore-entities-by-score-document';
import { exploreEntitiesConnectionDocument } from './explore-entities-document';
import { parseEntityUpdatedAtToUnixSec } from './explore-relative-time';

export type ExploreSort = 'new' | 'top';
export type ExploreTime = 'today' | 'week' | 'month' | 'year' | 'all';

export type ExploreFeedItem = {
  entityId: string;
  spaceId: string;
  spaceName: string;
  spaceImage: string | null;
  types: { id: string; name: string | null }[];
  createdAtSec: number;
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

// Entities we never want to surface in any feed.
// - `System type` relation to the `System` entity: marks system-managed rows.
// - `types` relation to `Data block` / `Text block`: these are block entities that
//   exist as internal structure of parent entities and aren't meaningful on their own.
const SYSTEM_TYPE_PROPERTY_ID = '88b3d6ad288c529ca2120e1c24819185';
const SYSTEM_ENTITY_ID = '2ff7ea098b9e50bc9be78a0cafa268d0';
const DATA_BLOCK_TYPE_ID = 'b8803a8665de412bbb357e0c84adf473';
const TEXT_BLOCK_TYPE_ID = '76474f2f00894e77a0410b39fb17d0bf';

const FEED_EXCLUDED_RELATIONS_FILTER = {
  relations: {
    none: {
      or: [
        { typeId: { is: SYSTEM_TYPE_PROPERTY_ID }, toEntityId: { is: SYSTEM_ENTITY_ID } },
        {
          typeId: { is: SystemIds.TYPES_PROPERTY },
          toEntityId: { in: [DATA_BLOCK_TYPE_ID, TEXT_BLOCK_TYPE_ID] },
        },
      ],
    },
  },
} satisfies EntityFilter;

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

type ExploreEntity = Entity & { commentCount: number; createdAt?: string };

type ExploreEntitiesPageResponse = {
  entities: ExploreEntity[];
  endCursor: string | null;
  hasNextPage: boolean;
};

type EntitiesConnectionShape = {
  nodes?: unknown[];
  pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
} | null;

function decodeConnection(connection: EntitiesConnectionShape): ExploreEntitiesPageResponse {
  const entities: ExploreEntity[] = [];
  for (const n of (connection?.nodes ?? []) as Array<
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
    endCursor: connection?.pageInfo?.endCursor ?? null,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
  };
}

function decodeExploreEntities(data: { entitiesConnection?: EntitiesConnectionShape }): ExploreEntitiesPageResponse {
  return decodeConnection(data.entitiesConnection ?? null);
}

function decodeExploreEntitiesByScore(data: {
  entitiesOrderedByScoreConnection?: EntitiesConnectionShape;
}): ExploreEntitiesPageResponse {
  return decodeConnection(data.entitiesOrderedByScoreConnection ?? null);
}

function buildFeedFilter(args: {
  time: ExploreTime;
  typeIds?: readonly string[];
  requireName?: boolean;
}): EntityFilter {
  const t = timeThresholdSec(args.time);
  return {
    ...FEED_EXCLUDED_RELATIONS_FILTER,
    ...(args.typeIds?.length ? { typeIds: { overlaps: [...args.typeIds] } } : {}),
    ...(args.requireName !== false ? { name: { isNull: false, isNot: '' } } : {}),
    ...(t != null ? { createdAt: { greaterThanOrEqualTo: String(t) } } : {}),
  };
}

async function fetchExploreEntitiesPage(args: {
  spaceIds: string[];
  time: ExploreTime;
  limit: number;
  after: string | null;
  orderBy: EntitiesOrderBy[];
  typeIds?: readonly string[];
  requireName?: boolean;
}): Promise<ExploreEntitiesPageResponse> {
  return Effect.runPromise(
    graphql({
      query: exploreEntitiesConnectionDocument,
      decoder: decodeExploreEntities,
      variables: {
        spaceIds: { in: args.spaceIds } as UuidFilter,
        limit: args.limit,
        after: args.after,
        filter: buildFeedFilter(args),
        orderBy: args.orderBy,
        spaceIdsForLists: args.spaceIds,
      },
    })
  );
}

// TEMP(explore-top-sort): hits the staging API via endpointOverride. When the
// field lands on the production testnet endpoint, drop the override and this
// function can be folded back into the main fetcher with a different document.
async function fetchTopEntitiesPage(args: {
  spaceIds: string[];
  time: ExploreTime;
  limit: number;
  after: string | null;
  typeIds?: readonly string[];
  requireName?: boolean;
}): Promise<ExploreEntitiesPageResponse> {
  return Effect.runPromise(
    graphql({
      query: exploreEntitiesByScoreConnectionDocument,
      decoder: decodeExploreEntitiesByScore,
      endpointOverride: SCORE_API_STAGING_URL_TEMP,
      variables: {
        limit: args.limit,
        after: args.after,
        // `entitiesOrderedByScoreConnection` has no top-level `spaceIds` arg — it
        // must be nested inside `filter` (unlike the regular `entitiesConnection`).
        filter: { ...buildFeedFilter(args), spaceIds: { in: args.spaceIds } as UuidFilter },
        scoreType: 'RAW',
        sortDirection: 'DESC',
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

  const typesRelationIdNorm = normId(SystemIds.TYPES_PROPERTY);

  for (const e of entities) {
    const spaceId = pickDisplaySpaceId(e, allowedSpaceIds);
    if (!spaceId) continue;

    // Prefer space-scoped values so a card rendered for space A doesn't leak values
    // from space C. Fall back to the top-level aggregated name/description when the
    // entity has no value in the display space — avoids "Untitled" cards purely
    // because of the space boundary.
    const title =
      textValueForProperty(e, EXPLORE_ENTITY_NAME_PROPERTY_ID, spaceId) ?? e.name?.trim() ?? 'Untitled';
    const description =
      textValueForProperty(e, EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID, spaceId) ?? e.description ?? null;

    const displaySpaceIdNorm = normId(spaceId);
    const types = e.relations
      .filter(r => normId(r.type.id) === typesRelationIdNorm && normId(r.spaceId) === displaySpaceIdNorm)
      .map(r => ({ id: r.toEntity.id, name: r.toEntity.name }));

    items.push({
      entityId: e.id,
      spaceId,
      types,
      createdAtSec: parseEntityUpdatedAtToUnixSec(e.createdAt),
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
  /** Restrict surfaced entities to these type IDs (via `filter.typeIds.overlaps`). Omit for no type filter. */
  typeIds?: readonly string[];
  /** If true (default), filter out entities with null or empty `name`. */
  requireName?: boolean;
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

  const page =
    args.sort === 'top'
      ? await fetchTopEntitiesPage({
          spaceIds: baseIds,
          time: args.time,
          limit: scanChunk,
          after: args.cursor,
          typeIds: args.typeIds,
          requireName: args.requireName,
        })
      : await fetchExploreEntitiesPage({
          spaceIds: baseIds,
          time: args.time,
          limit: scanChunk,
          after: args.cursor,
          orderBy: [EntitiesOrderBy.CreatedAtDesc],
          typeIds: args.typeIds,
          requireName: args.requireName,
        });

  const enriched = buildItems(page.entities, allowed, memberOrEditorSet);
  const items = await attachMeta(enriched.slice(0, pageSize));

  const nextCursor = page.hasNextPage ? page.endCursor : null;

  return { items, nextCursor };
}
