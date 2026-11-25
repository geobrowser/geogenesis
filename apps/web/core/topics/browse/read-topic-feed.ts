import { parseExploreSort } from '~/core/explore/explore-feed-params';
import { fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { topicFeedFilter } from '~/core/topics/browse/topic-feed-filter';
import { parseTopicFeedSelectedIds, parseTopicFeedSpaceIds } from '~/core/topics/browse/topic-feed-params';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';

export type TopicFeedRequestContext = Awaited<ReturnType<typeof resolveExploreFeedRequestContext>>;

/** The query string `/api/topics/feed` reads, as raw strings, so a server caller asks the same question. */
export type TopicFeedParams = {
  topicId: string;
  routeSpaceId: string;
  typeIds: string | null;
  sort: string | null;
  topicIds?: string | null;
  spaceIds?: string | null;
  cursor?: string | null;
};

/**
 * The mixed Topic feed: every entity matched by its own Topics relations. Behind `/api/topics/feed`,
 * and called directly by the Topic page's server prefetch, so the two cannot drift apart.
 * `context` lets a caller asking several slices resolve the reader's memberships once.
 * Ids must already be valid; throws when the feed is unavailable.
 */
export async function readTopicFeed(
  params: TopicFeedParams,
  context?: TopicFeedRequestContext
): Promise<Awaited<ReturnType<typeof fetchExploreFeed>> | { items: []; nextCursor: null }> {
  const { topicId, routeSpaceId } = params;
  const typeIds = parseTopicFeedTypeIds(params.typeIds);
  if (typeIds.length === 0) return { items: [], nextCursor: null };

  const selectedTopicIds = parseTopicFeedSelectedIds(params.topicIds ?? null, { pageTopicId: topicId });
  const requestedSpaceIds = parseTopicFeedSpaceIds(params.spaceIds ?? null, routeSpaceId);
  const { browse, memberOrEditorSpaceIds, walletAddress } =
    context ?? (await resolveExploreFeedRequestContext(routeSpaceId));

  return fetchExploreFeed({
    browse,
    sort: parseExploreSort(params.sort),
    time: 'all',
    spaceFilterIds: requestedSpaceIds.length > 0 ? requestedSpaceIds : null,
    cursor: params.cursor ?? null,
    walletAddress,
    memberOrEditorSpaceIds,
    typeIds,
    requireName: true,
    // Best and New page through gaia's topic ranking table (GEO-3092); Top still uses the filter.
    rankedTopicIds: [topicId, ...selectedTopicIds],
    entityFilter: topicFeedFilter(topicId, selectedTopicIds),
  });
}
