import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { EntitiesOrderBy, type EntityFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { fetchProfile } from '~/core/io/subgraph';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';

import { exploreBestConnectionDocument } from './explore-best-document';
import {
  type ExploreCardEntity,
  type ExploreFeedItem,
  type ExploreFeedRow,
  buildExploreFeedRows,
  decodeExploreCardEntity,
} from './explore-card-item';
import { EXPLORE_ENTITY_NAME_PROPERTY_ID, EXPLORE_PAGE_SIZE } from './explore-constants';
import { claimsRequireDebateTagFilter } from './explore-debate-tag-filter';
import { EXPLORE_DIVERSITY_WINDOW_SIZE, applyDiversityCap, exploreItemTypeKey } from './explore-diversity';
import { exploreEntitiesByPropertyConnectionDocument } from './explore-entities-by-property-document';
import { exploreEntitiesConnectionDocument } from './explore-entities-document';
import { parseEntityUpdatedAtToUnixSec } from './explore-relative-time';
import { entityMatchesExploreTypeIds } from './explore-type-filter';
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

/**
 * How long one request will keep scanning for a window with something in it, and the hard stop on
 * how many it will look at. See the loop in `fetchExploreFeed` for why the scan happens here.
 *
 * A clock rather than a count, because a window's cost is not a constant and a count budget prices
 * it as one. Measured cold, one shot per cursor, which is what a reader scrolling actually does: a
 * window near the top of the ranking is 0.3-2s, and by offset 300 it is 11-12s — the ranked
 * connection's own cost at depth, present before any of this and unchanged by it. A flat budget of
 * six windows therefore meant a 2-second request near the top and an *81-second* one at depth,
 * measured, which is a worse failure than the empty-page loop it was meant to fix.
 *
 * Checked before each additional fetch, so the budget buys many windows where they are cheap —
 * which is where the crossable thin patches are — and at most one where they are not. The hard cap
 * bounds the cheap end, where the clock alone would allow a great many.
 */
const MAX_EMPTY_WINDOW_SCAN_MS = 3_000;
const MAX_EMPTY_WINDOW_SCANS = 6;

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
  requireDebateTagOnClaims?: boolean;
  includeEntityScopeInFilter?: boolean;
}): EntityFilter {
  const t = timeThresholdSec(args.time);
  return {
    ...FEED_EXCLUDED_RELATIONS_FILTER,
    ...(args.requireDebateTagOnClaims ? claimsRequireDebateTagFilter(args.spaceIds) : {}),
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
  requireDebateTagOnClaims?: boolean;
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
  requireDebateTagOnClaims?: boolean;
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
// Unlike the other two this sends no `buildFeedFilter`. Candidate generation inside
// `entities_ranked_for_feed` already enforces every clause it builds — name presence,
// system entities, excluded block types — and takes space, type and recency as its own
// arguments. See explore-best-document for why sending them twice is not merely
// redundant.
//
// The debate-tag clause is the one thing that connection does not already know about, so
// it is the only `filter` this sort ever sends (GEO-2835). It could not be applied to the
// rows here instead: the tag is not part of the card selection, and a page that dropped
// most of its claims after the fact would serve short pages and page unevenly.
//
// `requireName` is therefore not honoured here: an entity with no name is never a
// candidate, server-side, and cannot be opted back in. Nothing passes
// `requireName: false` today, and for this feed it would be a request to serve rows that
// render as a raw uuid.
// No `typeIds` parameter, deliberately: this connection cannot filter by type at a usable speed
// (GEO-2793), so accepting one and ignoring it would be worse than not offering it. The caller
// applies the whitelist to the rows instead.
async function fetchBestEntitiesPage(args: {
  spaceIds: string[];
  time: ExploreTime;
  limit: number;
  after: string | null;
  requireDebateTagOnClaims?: boolean;
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
        // `typeIds` is deliberately NOT sent (GEO-2793). Supplying it makes
        // `entities_ranked_for_feed` abandon its ranked index walk and sort all ~48.9M rows of
        // `entity_ranking_scores`: 43ms without it, 5.8s with the twelve Explore types, and a
        // statement timeout with one rare type — which rendered an *empty* feed, not a slow one.
        // The whitelist is applied to the returned rows instead, in `fetchExploreFeed`. Rows come
        // back in ranking order either way, so filtering here costs only yield, and the yield is
        // 64 of 66 against the 22 a page serves.
        //
        // Only Best is changed. `entitiesConnection` and `entitiesOrderedByPropertyConnection`
        // are 1.7x and 2.3x slower with the argument rather than 135x, and they have no
        // equivalent cliff, so New and Top keep filtering server-side where it is exact.
        createdAfter: t != null ? String(t) : undefined,
        // Left undefined when the caller does not ask for the tag gate, so the sort keeps its
        // no-filter fast path unless there is a clause the connection genuinely does not know.
        filter: args.requireDebateTagOnClaims ? claimsRequireDebateTagFilter(args.spaceIds) : undefined,
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
  /**
   * The spaces the reader has narrowed to, or `null` for no narrowing at all.
   *
   * A list rather than one id since GEO-2789's explore half: the space filter is a multi-select
   * now, and the reader opens on the spaces they belong to, which is usually more than one. An
   * *empty* list is not the same as `null` and is not expressible here on purpose — the caller
   * resolves "nothing ticked" to `null` before this is reached, because a filter matching no space
   * is a feed with nothing in it rather than an unfiltered one.
   */
  spaceFilterIds: string[] | null;
  cursor: string | null;
  walletAddress?: string | null;
  memberOrEditorSpaceIds: string[];
  /** Restrict surfaced entities to these type IDs (via `filter.typeIds.overlaps`). Omit for no type filter. */
  typeIds?: readonly string[];
  /** If true (default), filter out entities with null or empty `name`. */
  requireName?: boolean;
  /**
   * If true, a Claim reaches the feed only if it carries the `Debate` tag (GEO-2835). Every other
   * type is unaffected. Off by default, and off for the one caller that is not Explore: a space's
   * activity feed is a log of what has been edited there, and a claim nobody has curated yet is
   * precisely the kind of edit it exists to show.
   */
  requireDebateTagOnClaims?: boolean;
}): Promise<ExploreFeedResult> {
  const spaceMeta = browseSpaceRowsToMap(args.browse);
  const wanted = args.spaceFilterIds === null ? null : new Set(args.spaceFilterIds.map(normId));
  const baseIds = [...new Set([...spaceMeta.keys()].map(normId))].filter(id => (wanted ? wanted.has(id) : true));
  if (baseIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const allowed = new Set(baseIds);
  const memberOrEditorSet = new Set(args.memberOrEditorSpaceIds.map(normId));

  const pageSize = EXPLORE_PAGE_SIZE;
  const scanChunk = 30;

  const attachMeta = async (rows: ExploreFeedRow[]): Promise<ExploreFeedItem[]> => {
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
      /* Profile / membership checks must not drop the whole feed when subgraph is flaky. */
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

  const fetchWindow = (windowAfter: string | null) =>
    args.sort === 'best'
      ? fetchBestEntitiesPage({
          spaceIds: baseIds,
          time: args.time,
          limit: windowSize,
          after: windowAfter,
          requireDebateTagOnClaims: args.requireDebateTagOnClaims,
        })
      : args.sort === 'top'
        ? fetchTopEntitiesPage({
            spaceIds: baseIds,
            time: args.time,
            limit: windowSize,
            after: windowAfter,
            typeIds: args.typeIds,
            requireName: args.requireName,
            requireDebateTagOnClaims: args.requireDebateTagOnClaims,
          })
        : fetchExploreEntitiesPage({
            spaceIds: baseIds,
            time: args.time,
            limit: windowSize,
            after: windowAfter,
            orderBy: [EntitiesOrderBy.CreatedAtDesc],
            typeIds: args.typeIds,
            requireName: args.requireName,
            requireDebateTagOnClaims: args.requireDebateTagOnClaims,
          });

  const orderWindow = (entities: ExploreCardEntity[]): ExploreFeedRow[] => {
    const allRows = buildExploreFeedRows(entities, allowed, memberOrEditorSet);

    // Best filters by type here rather than in the query (see `fetchBestEntitiesPage`). The other
    // sorts already came back filtered, so re-checking them would be redundant — and worse than
    // redundant: a card's types are the TYPES relations *in its display space*, while the server's
    // predicate is not space-scoped, so the two can disagree at the margin. Applying it only where
    // the server no longer does keeps exactly one source of truth per sort.
    const rows =
      args.sort === 'best' && (args.typeIds?.length ?? 0) > 0
        ? allRows.filter(row => entityMatchesExploreTypeIds(row, args.typeIds ?? []))
        : allRows;

    // "Best" is the only sort that reorders (GEO-2690). "New" is reverse-chronological and
    // an activity log that shuffles is simply wrong; "Top" is an explicit "rank by score"
    // request, and the crowding-out was measured on Best, which is also the default tab.
    return args.sort === 'best' ? applyDiversityCap(rows, exploreItemTypeKey) : rows;
  };

  // A window that survives none of the above is not the end of the feed, and returning it as an
  // empty page is what makes it behave like one — badly (GEO-2835 review). The client's sentinel
  // has an 8000px rootMargin, so with nothing rendered it stays intersecting and refires the
  // instant the request settles; an empty page that still carries a cursor is therefore an
  // unbounded loop of round trips that get slower with depth, not a pause.
  //
  // Reachable since the debate-tag gate: Best cannot filter by type in the query (GEO-2793), so it
  // scans a window and applies the whitelist here — and past the ranked depth where tagged claims
  // run thin, a Claim-only selection matches nothing in a 30-row window while the connection still
  // reports another page. Measured over the eleven spaces that hold tagged claims: at offset 600 a
  // gated window held 0 claims against 13 ungated. Claim is one of the three default types, so
  // unticking the other two is all it takes.
  //
  // So the scan continues here, where one round trip covers it, rather than being handed back to a
  // client that will only ask again. Bounded because the alternative is unbounded: the ranked
  // connection reports `hasNextPage` for a long way past the last tagged claim, and the offset cap
  // that would end it applies only to the explicit `offset` argument, not to the `after` cursor
  // this uses — `["natural",1200]` as `after` still returns a full window.
  //
  // Budget spent with nothing found is reported as the end of the feed. That can end it while
  // something is still reachable further down — measured, offset 757 found nothing and offset 907
  // held 13 — so it is a real cost, taken because the alternative is a feed that scrolls forever
  // and because a reader this deep into a one-type selection can still widen the filter. There is
  // no third option here: the empty page has to either stop or be retried, and only the client can
  // do the latter without spinning.
  let windowAfter = after;
  let windowOffset = offset;
  let extraScans = 0;
  let scanBudgetSpent = false;
  let page = await fetchWindow(windowAfter);
  let ordered = orderWindow(page.entities);

  const scanDeadline = Date.now() + MAX_EMPTY_WINDOW_SCAN_MS;

  while (ordered.length <= windowOffset) {
    // The connection itself says there is nothing further: a genuine end, not a thin patch.
    if (!page.hasNextPage || !page.endCursor) break;
    if (extraScans >= MAX_EMPTY_WINDOW_SCANS || Date.now() >= scanDeadline) {
      scanBudgetSpent = true;
      break;
    }
    extraScans += 1;
    windowAfter = page.endCursor;
    // A fresh window is served from its start; the offset only ever indexed the window the
    // cursor named.
    windowOffset = 0;
    page = await fetchWindow(windowAfter);
    ordered = orderWindow(page.entities);
  }

  // Serving a prefix and advancing the cursor past the whole scan is what dropped ranks
  // 23-30 of every page before (GEO-2695). The offset keeps the rest reachable.
  const slice = ordered.slice(windowOffset, windowOffset + pageSize);

  return {
    items: await attachMeta(slice),
    nextCursor: scanBudgetSpent
      ? null
      : nextExploreWindowCursor({
          after: windowAfter,
          offset: windowOffset,
          served: slice.length,
          windowLength: ordered.length,
          hasNextPage: page.hasNextPage,
          endCursor: page.endCursor,
        }),
  };
}
