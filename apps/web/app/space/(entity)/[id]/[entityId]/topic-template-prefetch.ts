import { QueryClient } from '@tanstack/react-query';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import type { QuerySeedEntry } from '~/core/query-seed';
import {
  RECENT_AGENDA_CLAIMS_QUERY_KEY,
  type RecentAgendaClaim,
  agendaClaimsForTopic,
  fetchRecentAgendaClaims,
} from '~/core/templates/adapters/recent-agenda-claims';
import {
  LIVE_COVERAGE_LIMIT,
  type TopicBestDebates,
  type TopicFeedSlice,
  buildOrderedClaimSeeds,
  fetchTopicClaimVotes,
  keepTaggedItems,
  topicBestDebatesQueryKey,
  topicClaimVotesQueryKey,
  topicFeedEntityIds,
  topicFeedSliceQueryKey,
  topicVoteClaimIds,
} from '~/core/templates/adapters/topic-template-queries';
import {
  fetchTopicTaggedInSpace,
  topicTaggedInSpaceIds,
  topicTaggedInSpaceQueryKey,
} from '~/core/templates/adapters/use-topic-tagged-in-space';
import { TEMPLATE_ONTOLOGY, readEntityRelations } from '~/core/templates/ontology';
import { readTopicFeed } from '~/core/topics/browse/read-topic-feed';
import { fetchTopicCoverage, topicCoverageQueryKey } from '~/core/topics/browse/use-topic-coverage';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

/**
 * How long the page's response stays open for the Topic sections' reads. The page itself does not
 * wait for them: it is sent with the sections as skeletons, and they stream in when these answer.
 * Past this, whatever has not landed is left to the client, exactly as before.
 */
export const TOPIC_PREFETCH_BUDGET_MS = 1_500;

/**
 * The Topic template's section reads (Claims, Debates, Sources), made on the server and handed to the
 * page as `QuerySeed` entries, so the sections are in the page's HTML rather than drawn ~5 s after
 * it: before this, each was asked by the browser only after hydration, through `/api/topics/feed`
 * and the graph, and then the vote counts after those.
 *
 * Every key comes from the module the hook builds its own from, and every step between the reads
 * (the space's tag check, the claim seeds, the vote ids) is the hook's own function, so the seed
 * lands on exactly the keys the first client render asks for. A key that missed would only cost the
 * request the client makes today.
 *
 * `QuerySeed` rather than `HydrationBoundary`: the app's `queryClient` is one module-level instance,
 * shared on the server by every request, so hydrating it would hand one reader's rows to the next,
 * and `HydrationBoundary` defers any key already in that cache to an effect, which never runs on the
 * server. `QuerySeed` renders the page on a client of its own there.
 *
 * Failures are swallowed, as in `profile-prefetch.ts`: only answered reads are seeded, so a read that
 * failed or ran past the budget is left out and the hook makes its own request, with its skeleton,
 * as it does today.
 *
 * Space-homepage Topics (`isSpaceHome`) read other feeds and are not prefetched; this covers the
 * entity route only.
 */
export async function prefetchTopicTemplateQueries({
  topicId,
  spaceId,
  topic,
  budgetMs = TOPIC_PREFETCH_BUDGET_MS,
}: {
  topicId: string;
  spaceId: string;
  /** The page's own entity read, for the topic's direct Claims relations. */
  topic: Entity;
  budgetMs?: number;
}): Promise<QuerySeedEntry[]> {
  // Per request, never shared: a module-level client would hand one reader's feed to the next.
  // `retry: false`: the graph client retries transport failures itself, and a second budget here
  // would hold the page's HTML rather than a hook's loading state.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const controller = new AbortController();
  const { signal } = controller;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>(resolve => {
    timer = setTimeout(resolve, budgetMs);
  });

  try {
    await Promise.race([
      readSections({ queryClient, topicId, spaceId, topic, signal }).catch(() => undefined),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    // Whatever is still in flight is the client's to ask again.
    controller.abort();
  }

  // Answered reads only: a failed or unfinished one is left out, and its hook asks for itself.
  return queryClient
    .getQueryCache()
    .getAll()
    .filter(query => query.state.status === 'success')
    .map(query => ({ queryKey: query.queryKey, data: query.state.data, updatedAt: query.state.dataUpdatedAt }));
}

async function readSections({
  queryClient,
  topicId,
  spaceId,
  topic,
  signal,
}: {
  queryClient: QueryClient;
  topicId: string;
  spaceId: string;
  topic: Entity;
  signal: AbortSignal;
}): Promise<void> {
  // One membership lookup for the three feed slices; `/api/topics/feed` makes it once per slice.
  const feedContext = resolveExploreFeedRequestContext(spaceId);
  const readSlice = async (typeId: string, sort: 'best' | 'top'): Promise<ExploreFeedItem[]> => {
    const result = await readTopicFeed({ topicId, routeSpaceId: spaceId, typeIds: typeId, sort }, await feedContext);
    // Through JSON, as the route hands it to the browser, so the cached rows are the ones the
    // client would have parsed: no `undefined` keys, no class instances.
    return JSON.parse(JSON.stringify(result.items ?? [])) as ExploreFeedItem[];
  };

  const sliceRead = (slice: TopicFeedSlice, sort: 'best' | 'top') => {
    const queryKey = topicFeedSliceQueryKey(slice, topicId, spaceId);
    return queryClient
      .prefetchQuery({ queryKey, queryFn: () => readSlice(CLAIM_TYPE_ID, sort) })
      .then(() => queryClient.getQueryData<ExploreFeedItem[]>(queryKey));
  };
  const debatesKey = topicBestDebatesQueryKey(topicId, spaceId, false);
  const debatesRead = queryClient
    .prefetchQuery({
      queryKey: debatesKey,
      queryFn: async (): Promise<TopicBestDebates> => ({
        items: await readSlice(DEBATE_TYPE_ID, 'best'),
        fromSpaceFeed: false,
      }),
    })
    .then(() => queryClient.getQueryData<TopicBestDebates>(debatesKey));

  const agendaRead = queryClient
    .prefetchQuery({
      queryKey: RECENT_AGENDA_CLAIMS_QUERY_KEY,
      queryFn: () => fetchRecentAgendaClaims({ signal }),
    })
    .then(() => queryClient.getQueryData<RecentAgendaClaim[]>(RECENT_AGENDA_CLAIMS_QUERY_KEY));

  // The page's own coverage read, as the hook asks it: scoped to the route space and its relation.
  const coverageArgs = {
    topicId,
    spaceIds: [normId(spaceId)],
    scopeRelationToSpaces: true,
    first: LIVE_COVERAGE_LIMIT,
  };
  const coverageRead = queryClient.prefetchQuery({
    queryKey: topicCoverageQueryKey(coverageArgs),
    queryFn: () => fetchTopicCoverage(coverageArgs, signal),
  });

  const [topClaimsItems, bestClaimsItems, debates, agenda] = await Promise.all([
    sliceRead('top-claims', 'top'),
    sliceRead('best-claims', 'best'),
    debatesRead,
    agendaRead,
    coverageRead,
  ]);

  // Without every slice the client asks its own, and the tag check and vote ids follow from those.
  if (!topClaimsItems || !bestClaimsItems || !debates) return;

  // The space's own tag check, keyed by the same ids the hook derives from the same three slices.
  const taggedIds = topicTaggedInSpaceIds(topicFeedEntityIds([topClaimsItems, bestClaimsItems, debates.items]));
  let tagged: Set<string> | null = null;
  if (taggedIds.length > 0) {
    const taggedKey = topicTaggedInSpaceQueryKey(topicId, spaceId, taggedIds);
    await queryClient.prefetchQuery({
      queryKey: taggedKey,
      queryFn: () => fetchTopicTaggedInSpace({ topicId, spaceId, entityIds: taggedIds, signal }),
    });
    tagged = queryClient.getQueryData<Set<string>>(taggedKey) ?? null;
    if (!tagged) return;
  }

  // The vote ids depend on the agenda claims too; without them the client's ids differ anyway.
  if (!agenda) return;

  // The claim set the first client render draws: no linked or viewer claims yet, which the client
  // reads from its local store after mount.
  const bestDebates = keepTaggedItems(debates.items, tagged, false);
  const seeds = buildOrderedClaimSeeds({
    spaceId,
    bestClaims: keepTaggedItems(bestClaimsItems, tagged, false),
    topClaims: keepTaggedItems(topClaimsItems, tagged, false),
    bestDebates,
    linkedClaims: [],
    directClaimRels: readEntityRelations(topic, TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID),
    agendaClaims: agendaClaimsForTopic(agenda, topicId, spaceId),
    viewerLinkedClaims: [],
  });
  const voteIds = topicVoteClaimIds(seeds, bestDebates);
  if (voteIds.length === 0) return;
  await queryClient.prefetchQuery({
    queryKey: topicClaimVotesQueryKey(voteIds),
    queryFn: () => fetchTopicClaimVotes(voteIds, signal),
  });
}
