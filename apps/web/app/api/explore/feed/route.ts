import { NextResponse } from 'next/server';

import { browseSidebarVisibleSpaces } from '~/core/browse/fetch-browse-sidebar-data';
import { PUBLIC_FEED_PARAM, parseExplorePageSort, parseExploreTime } from '~/core/explore/explore-feed-params';
import { EXPLORE_FEED_POLICY } from '~/core/explore/explore-feed-policy';
import { parseExploreTypeIdsParam } from '~/core/explore/explore-type-filter';
import { feedUnavailableResponse } from '~/core/explore/feed-route-response';
import { type ExploreSort, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { createPersonalizedWindowReorder } from '~/core/explore/for-you/personalized-window';
import {
  decodePersonalizedCursor,
  encodePersonalizedCursor,
  resolveForYouViewer,
} from '~/core/explore/for-you/resolve-for-you-viewer';
import { readServingFreshSlotState } from '~/core/explore/fresh-slot/fresh-slot-store';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { seenDemotionPageConfig } from '~/core/explore/seen-demotion/seen-demotion-config';
import { normId } from '~/core/utils/norm-id';

/** Enough for any real follow list; the query string stays under ~7 KB. */
const MAX_FOLLOWED_TOPIC_IDS = 200;

/** Dashless 32-hex ids, deduplicated. Anything else is dropped rather than sent to the graph. */
function parseFollowedTopicIds(raw: string | null): string[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map(normId)
    .filter(id => /^[0-9a-f]{32}$/.test(id));
  return [...new Set(ids)].slice(0, MAX_FOLLOWED_TOPIC_IDS);
}

/**
 * GEO-3144. Off unless set: whether gaia's feed experiments may interleave Explore pages. Public
 * because the client reads it too, to send the identity token on Best only while it is on.
 */
function feedInterleavingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEED_INTERLEAVING_ENABLED === 'true';
}

/**
 * The signed-out first page of Best, which is identical for every reader (seen demotion runs in
 * the browser), so the CDN may keep it. Vercel's cache key ignores cookies, so the cacheable page
 * lives at its own URL (`public=1`) and the server treats that URL as anonymous whatever cookies or
 * tokens arrive; the personalized URL is never given these headers.
 */
const PUBLIC_FEED_CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=60';

/** Only exactly `?sort=best&public=1` is cached, so arbitrary query strings cannot fill the cache. */
function isCacheablePublicFirstPage(searchParams: URLSearchParams): boolean {
  const keys = [...searchParams.keys()].sort();
  return (
    keys.length === 2 && keys[0] === PUBLIC_FEED_PARAM && keys[1] === 'sort' && searchParams.get('sort') === 'best'
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageSort = parseExplorePageSort(searchParams.get('sort'));
  const sort: ExploreSort = pageSort === 'for-you' ? 'best' : pageSort;
  const time = parseExploreTime(searchParams.get('time'));
  // A list since GEO-2789's explore half. `spaceId` is still read so an older client, or a link
  // someone kept, still narrows to the one space it names.
  const spaceIdsParam = searchParams.get('spaceIds') ?? searchParams.get('spaceId');
  const cursor = searchParams.get('cursor');
  const typeIds = parseExploreTypeIdsParam(searchParams.get('typeIds'));

  if (typeIds.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const anonymous = searchParams.get(PUBLIC_FEED_PARAM) === '1';
  const { browse, memberOrEditorSpaceIds, walletAddress, personalMemberSpaceId } =
    await resolveExploreFeedRequestContext(undefined, { anonymous });

  // GEO-3140. For you personalizes only for a viewer proven by a Privy identity token, and only
  // when gaia's private route is configured (GAIA_INTERNAL_TOKEN). GEO-3144's interleaving needs the
  // viewer on Best too, but only while it is switched on.
  const interleaving = feedInterleavingEnabled();
  const viewerId =
    !anonymous && sort === 'best' && (pageSort === 'for-you' || interleaving)
      ? await resolveForYouViewer(request, { walletAddress, personalMemberSpaceId })
      : null;
  const personalized = viewerId !== null;
  // Decoded whether or not this request is personalized, so a scroll that loses its token midway
  // still pages on rather than restarting.
  const { asOf, inner: windowCursor } = decodePersonalizedCursor(cursor);

  // GEO-3083, the fallback when For you cannot be personalized: Best plus the followed-topic
  // stream, so with no followed topics it is exactly Best and a signed-out reader never gets an
  // empty feed. The client sends the ids because its follow cache updates the moment a follow is
  // written, where a server read would trail the indexer.
  const forYouTopicIds =
    pageSort === 'for-you' && !personalized ? parseFollowedTopicIds(searchParams.get('followedTopicIds')) : [];

  // Only spaces this reader may see, whatever they asked for. `all` and an empty parameter both
  // mean no narrowing; so does a list that matches nothing they can see, because a filter naming
  // only spaces they cannot see is a request we have no honest way to answer and an empty feed is
  // the wrong answer to it.
  let spaceFilter: string[] | null = null;
  if (spaceIdsParam && spaceIdsParam !== 'all') {
    const wanted = new Set(spaceIdsParam.split(',').map(normId).filter(Boolean));
    const visible = browseSidebarVisibleSpaces(browse)
      .filter(row => wanted.has(normId(row.id)))
      .map(row => row.id);
    if (visible.length > 0) spaceFilter = visible;
  }

  // GEO-3221. Best's fresh slot, read from the ranking lab's live config (disabled unless an admin
  // turned it on). Plain Best only; For you is left as it is.
  const freshState = pageSort === 'best' ? await readServingFreshSlotState() : null;
  // GEO-3234. Seen demotion runs in the browser; the page only carries whether it is on and its
  // knobs, identical for every visitor, so nothing per-visitor reaches this response or its caches.
  const seenDemotion = seenDemotionPageConfig(freshState?.config.seenDemotion);

  try {
    const result = await fetchExploreFeed({
      browse,
      sort,
      time,
      spaceFilterIds: spaceFilter,
      cursor: windowCursor,
      walletAddress,
      memberOrEditorSpaceIds,
      typeIds,
      ...EXPLORE_FEED_POLICY,
      forYouTopicIds,
      reorderWindow:
        viewerId !== null
          ? createPersonalizedWindowReorder({
              userId: viewerId,
              requested: pageSort === 'for-you' ? 'for-you' : 'best',
              asOf,
              interleavingEnabled: interleaving,
            })
          : undefined,
      freshSlot: freshState ? { config: freshState.config, revision: freshState.revision } : undefined,
      markPlayableLeads: seenDemotion !== null,
    });
    // Every card names the version that put it there, so engagement can be credited to it.
    const feed = result.feed;
    const items = feed
      ? result.items.map(item => (item.ranking ? item : { ...item, ranking: { version: feed.version } }))
      : result.items;
    // Plain Best only: For you and an interleaving experiment are left alone, as with the fresh slot.
    const seenApplies = seenDemotion !== null && feed?.name === 'best' && !personalized;
    const { reserve, ...rest } = result;
    const body = {
      ...rest,
      ...(seenApplies ? { seenDemotion, ...(reserve ? { reserve } : {}) } : {}),
      items,
      nextCursor: personalized ? encodePersonalizedCursor(asOf, result.nextCursor) : result.nextCursor,
    };
    // A personalized page belongs to one person: never let any cache between here and them keep it.
    if (personalized) return NextResponse.json(body, { headers: { 'cache-control': 'private, no-store' } });
    // An empty page is never kept: it is as likely a dependency hiccup as a truth.
    if (anonymous && isCacheablePublicFirstPage(searchParams) && items.length > 0) {
      return NextResponse.json(body, { headers: { 'cache-control': PUBLIC_FEED_CACHE_CONTROL } });
    }
    return NextResponse.json(body);
  } catch (e) {
    console.error('explore feed', e);
    return feedUnavailableResponse();
  }
}
