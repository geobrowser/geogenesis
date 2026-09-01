import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { EntitiesOrderBy, type EntityFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';

import {
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
  EXPLORE_PAGE_SIZE,
} from './explore-constants';
import { exploreBestConnectionDocument } from './explore-best-document';
import {
  type ExploreCardEntity,
  type ExploreFeedItem,
  type ExploreFeedRow,
  buildExploreFeedRows,
  decodeExploreCardEntity,
} from './explore-card-item';
import {
  EXPLORE_DIVERSITY_WINDOW_SIZE,
  applyDiversityCap,
  exploreItemTypeKey,
} from './explore-diversity';
import { exploreEntitiesByPropertyConnectionDocument } from './explore-entities-by-property-document';
import { exploreEntitiesConnectionDocument } from './explore-entities-document';
import { parseEntityUpdatedAtToUnixSec } from './explore-relative-time';
import { decodeExploreWindowCursor, nextExploreWindowCursor } from './explore-window-cursor';

/**
 * `best` is the Phase A ranked feed (quality + structure + recency, server-side).
 * `top` ranks by the integer score property; `new` is reverse-chronological.
 */
export type ExploreSort = 'new' | 'top' | 'best';
export type ExploreTime = 'today' | 'week' | 'month' | 'year' | 'all';

// Re-exported so the many components importing the card's item shape from here keep working; it is
// defined alongside the card builder in `explore-card-item`, which the Coverage section also uses.
export type { ExploreFeedItem };

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

type ExploreEntitiesPageResponse = {
  entities: ExploreCardEntity[];
  endCursor: string | null;
  hasNextPage: boolean;
};

type EntitiesConnectionShape = {
  nodes?: unknown[];
  pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
} | null;

function decodeConnection(connection: EntitiesConnectionShape): ExploreEntitiesPageResponse {
  const entities: ExploreCardEntity[] = [];
  for (const node of connection?.nodes ?? []) {
    const decoded = decodeExploreCardEntity(node);
    if (decoded) entities.push(decoded);
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

function decodeExploreEntitiesByProperty(data: {
  entitiesOrderedByPropertyConnection?: EntitiesConnectionShape;
}): ExploreEntitiesPageResponse {
  return decodeConnection(data.entitiesOrderedByPropertyConnection ?? null);
}

function decodeExploreBest(data: {
  entitiesRankedForFeedConnection?: EntitiesConnectionShape;
}): ExploreEntitiesPageResponse {
  return decodeConnection(data.entitiesRankedForFeedConnection ?? null);
}

function buildFeedFilter(args: {
  spaceIds: string[];
  time: ExploreTime;
  typeIds?: readonly string[];
  requireName?: boolean;
  includeEntityScopeInFilter?: boolean;
}): EntityFilter {
  const t = timeThresholdSec(args.time);
  return {
    ...FEED_EXCLUDED_RELATIONS_FILTER,
    ...(args.includeEntityScopeInFilter
      ? {
          spaceIds: { overlaps: [...args.spaceIds] },
          ...(args.typeIds?.length ? { typeIds: { overlaps: [...args.typeIds] } } : {}),
        }
      : {}),
    ...(args.requireName !== false
      ? {
          values: {
            some: {
              spaceId: { in: args.spaceIds },
              propertyId: { is: EXPLORE_ENTITY_NAME_PROPERTY_ID },
              text: { isNull: false, isNot: '' },
            },
          },
        }
      : {}),
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
        limit: args.limit,
        after: args.after,
        filter: buildFeedFilter(args),
        orderBy: args.orderBy,
        spaceIds: { in: args.spaceIds },
        typeIds: args.typeIds?.length ? { in: [...args.typeIds] } : undefined,
        spaceIdsForLists: args.spaceIds,
      },
    })
  );
}

// "Top" sort: rank by the integer score property via `entitiesOrderedByPropertyConnection`.
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
      query: exploreEntitiesByPropertyConnectionDocument,
      decoder: decodeExploreEntitiesByProperty,
      variables: {
        first: args.limit,
        after: args.after,
        filter: buildFeedFilter(args),
        propertyId: SCORE_SYSTEM_PROPERTY,
        dataType: 'integer',
        sortDirection: 'DESC',
        spaceIds: args.spaceIds,
        typeIds: args.typeIds?.length ? [...args.typeIds] : undefined,
        spaceIdsForLists: args.spaceIds,
        // Union in entities that match the type/space filter but have no score row yet
        // (missing-as-zero for the integer Score property), so "Top" surfaces the full
        // set of entities ranked by score rather than only those already scored.
        includeWithoutValue: true,
      },
    })
  );
}

// "Best" sort: the Phase A ranked feed via `entitiesRankedForFeedConnection`.
//
// Unlike the other two this passes no `filter`. Candidate generation inside
// `entities_ranked_for_feed` already enforces every clause `buildFeedFilter` builds —
// name presence, system entities, excluded block types — and takes space, type and
// recency as its own arguments. See explore-best-document for why sending them twice is
// not merely redundant.
//
// `requireName` is therefore not honoured here: an entity with no name is never a
// candidate, server-side, and cannot be opted back in. Nothing passes
// `requireName: false` today, and for this feed it would be a request to serve rows that
// render as a raw uuid.
async function fetchBestEntitiesPage(args: {
  spaceIds: string[];
  time: ExploreTime;
  limit: number;
  after: string | null;
  typeIds?: readonly string[];
}): Promise<ExploreEntitiesPageResponse> {
  const t = timeThresholdSec(args.time);
  return Effect.runPromise(
    graphql({
      query: exploreBestConnectionDocument,
      decoder: decodeExploreBest,
      variables: {
        first: args.limit,
        after: args.after,
        spaceIds: args.spaceIds,
        typeIds: args.typeIds?.length ? [...args.typeIds] : undefined,
        createdAfter: t != null ? String(t) : undefined,
        spaceIdsForLists: args.spaceIds,
      },
    })
  );
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
  /**
   * The viewer's personal space, already resolved and validated by the caller.
   *
   * Passed in rather than re-derived here. Both routes resolve it before they get this
   * far, so looking it up again cost a second `fetchProfile` for the same wallet in a
   * later sequential stage — and the value they hold is the better one: `fetchProfile`
   * puts the *wallet address* in `spaceId` on all three of its failure paths, which
   * passes a truthy check and then reaches a `UUID!` argument (see the note on
   * `getGovernanceHomeSpaceContext`). `resolveMemberSpaceFromWallet` validates it and
   * falls back to `getSpaceByAddress`, so pending-membership state stops being silently
   * wrong for exactly the users whose profile lookup already failed.
   */
  personalMemberSpaceId?: string | null;
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
    rows: ExploreFeedRow[]
  ): Promise<ExploreFeedItem[]> => {
    const out: ExploreFeedItem[] = rows.map(r => ({
      ...r,
      spaceName: spaceMeta.get(normId(r.spaceId))?.name ?? r.spaceId.slice(0, 8),
      spaceImage: spaceMeta.get(normId(r.spaceId))?.image ?? null,
      hasPendingMembershipRequest: false,
    }));

    const memberSpaceId = args.personalMemberSpaceId;
    if (!memberSpaceId) return out;

    const pendingTargets = [...new Set(out.filter(o => !o.isMemberOrEditor).map(o => o.spaceId))];
    if (pendingTargets.length === 0) return out;

    try {
      const pendingMap = new Map<string, boolean>();
      await Promise.all(
        pendingTargets.map(async sid => {
          try {
            // Only an open vote is "pending"; a stuck (vote-ended) request must fall
            // through to a clickable Join so the user can re-request.
            const req = await fetchActiveMemberRequest(sid, memberSpaceId);
            pendingMap.set(normId(sid), req != null && !req.isVotingEnded);
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
      /* Membership checks must not drop the whole feed when subgraph is flaky. */
    }
    return out;
  };

  const { after, offset } = decodeExploreWindowCursor(args.cursor);

  // Every sort scans wider than it serves — the row builder drops entities with no
  // displayable space, so over-scanning absorbs that. Best scans wider still, because a
  // diversity cap cannot break up a page it cannot see past. A single type is the
  // exception: there is nothing to diversify against, so it keeps the narrow scan.
  const windowSize =
    args.sort === 'best' && (args.typeIds?.length ?? 0) !== 1 ? EXPLORE_DIVERSITY_WINDOW_SIZE : scanChunk;

  const page =
    args.sort === 'best'
      ? await fetchBestEntitiesPage({
          spaceIds: baseIds,
          time: args.time,
          limit: windowSize,
          after,
          typeIds: args.typeIds,
        })
      : args.sort === 'top'
      ? await fetchTopEntitiesPage({
          spaceIds: baseIds,
          time: args.time,
          limit: windowSize,
          after,
          typeIds: args.typeIds,
          requireName: args.requireName,
        })
      : await fetchExploreEntitiesPage({
          spaceIds: baseIds,
          time: args.time,
          limit: windowSize,
          after,
          orderBy: [EntitiesOrderBy.CreatedAtDesc],
          typeIds: args.typeIds,
          requireName: args.requireName,
        });

  const rows = buildExploreFeedRows(page.entities, allowed, memberOrEditorSet);

  // "Best" is the only sort that reorders (GEO-2690). "New" is reverse-chronological and
  // an activity log that shuffles is simply wrong; "Top" is an explicit "rank by score"
  // request, and the crowding-out was measured on Best, which is also the default tab.
  const ordered = args.sort === 'best' ? applyDiversityCap(rows, exploreItemTypeKey) : rows;

  // Serving a prefix and advancing the cursor past the whole scan is what dropped ranks
  // 23-30 of every page before (GEO-2695). The offset keeps the rest reachable.
  const slice = ordered.slice(offset, offset + pageSize);

  return {
    items: await attachMeta(slice),
    nextCursor: nextExploreWindowCursor({
      after,
      offset,
      served: slice.length,
      windowLength: ordered.length,
      hasNextPage: page.hasNextPage,
      endCursor: page.endCursor,
    }),
  };
}
