'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { useDebouncedSearch } from '~/core/debates/matchmaking/use-debounced-search';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import { useTaggedClaimSearch } from '~/core/debates/tagged-claim-search';
import { useTaggedTopicFacet } from '~/core/debates/tagged-claims';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '~/core/debates/use-debate-publishable-spaces';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { useLastSettled } from '~/core/hooks/use-last-settled';
import { graphql } from '~/core/io/graphql-client';

import {
  NO_SPACE_ACTIVITY_FILTERS,
  SPACE_ACTIVITY_PAGE_SIZE,
  type SpaceActivityFilters,
  type SpaceActivityRowsPage,
  type SpaceActivityRowsResponse,
  type SpaceActivitySort,
  decodeSpaceActivityRows,
  spaceActivityRowsDocumentFor,
  spaceActivityRowsFilter,
  spaceActivityRowsVariables,
  spaceTaggedClaimFilters,
} from './space-activity-rows';
import {
  NO_SPACE_DEBATE_ACTIVITY_COUNTS,
  type SpaceActivityKind,
  type SpaceDebateActivityCounts,
  type SpaceDebateActivityCountsResult,
  decodeSpaceDebateActivityCounts,
  spaceDebateActivityCountsDocument,
  spaceDebateActivityCountsVariables,
} from './space-debate-activity';

/**
 * None of this moves on anything a reader does on the page, and the Overview card asks for all of
 * it on every visit. A minute is what the profile's equivalent counts hold for, and for the same
 * reason.
 */
const SPACE_ACTIVITY_STALE_TIME = 60_000;

/**
 * Everything that changes which rows come back, and in what order.
 *
 * All of it is part of the cache key: two lists differing by a sort or a picked topic are two
 * different questions, and sharing an entry between them would serve one list's answer for the
 * other's until it refetched.
 */
const rowsQueryKey = (
  spaceId: string,
  kind: SpaceActivityKind,
  sort: SpaceActivitySort,
  filters: SpaceActivityFilters
) => ['space-activity-rows', spaceId, kind, sort, filters.topicIds, filters.searchClaimIds] as const;

function fetchRowsPage(args: {
  spaceId: string;
  kind: SpaceActivityKind;
  sort: SpaceActivitySort;
  filters: SpaceActivityFilters;
  after: string | null;
  signal?: AbortSignal;
}) {
  return Effect.runPromise(
    graphql({
      query: spaceActivityRowsDocumentFor(args.sort),
      decoder: (response: SpaceActivityRowsResponse) => decodeSpaceActivityRows(args.spaceId, response),
      variables: spaceActivityRowsVariables({
        spaceId: args.spaceId,
        kind: args.kind,
        sort: args.sort,
        first: SPACE_ACTIVITY_PAGE_SIZE,
        after: args.after,
        filters: args.filters,
      }),
      signal: args.signal,
    })
  );
}

/**
 * Whether this space is set up for debates at all.
 *
 * "Set up for debates" is exactly "the acceptor service account edits it": a finished debate is
 * published into the claim's home space by that account, and publishing needs editor rights there
 * — a member can propose but not execute, so anything else reverts on-chain. `/api/debates/
 * publishable-spaces` resolves that list server-side (the acceptor's identity stays server-only),
 * and it is the same list the publish sweep discovers its work from.
 *
 * `isSpaceDebatePublishable` fails *open* when the list is unknown — no acceptor configured, or the
 * lookup failed — and that is the right way round here too. The card is additionally gated on there
 * being debate activity to show, so failing open can at worst reveal a section on a space that
 * genuinely holds debates and claims; failing closed would hide it across every preview and local
 * environment, which run with no acceptor at all.
 */
export function useSpaceDebateEligibility(spaceId: string): { isEligible: boolean; isLoading: boolean } {
  const { publishableSpaceIds, isLoading } = useDebatePublishableSpaces();
  return {
    isEligible: isSpaceDebatePublishable(spaceId, publishableSpaceIds),
    isLoading,
  };
}

/**
 * How many debates and debate-tagged claims this space holds.
 *
 * Its own request rather than something derived from the rows below, because the rows are one page
 * and the pill beside them states a total — the mistake the profile card documents as "the claims
 * gallery read 20 where the rail beside it said 192".
 */
export function useSpaceDebateActivityCounts(
  spaceId: string,
  enabled: boolean
): { counts: SpaceDebateActivityCounts; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['space-debate-activity-counts', spaceId] as const,
    enabled: enabled && spaceId !== '',
    staleTime: SPACE_ACTIVITY_STALE_TIME,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: spaceDebateActivityCountsDocument,
          decoder: (result: SpaceDebateActivityCountsResult) => decodeSpaceDebateActivityCounts(result),
          // The list's own clause, so the pill and the list it leads to count the same corpus.
          variables: spaceDebateActivityCountsVariables(spaceId, spaceActivityRowsFilter(spaceId, 'claims')),
          signal,
        })
      ),
  });

  return {
    counts: data ?? NO_SPACE_DEBATE_ACTIVITY_COUNTS,
    isLoading: enabled && isLoading,
    isError,
  };
}

/**
 * The top of one kind's ranking — what the Overview card's gallery draws.
 *
 * The first page of the same query the full list opens with, so "See all claims" continues the
 * order rather than starting a different one. The card renders six of them; slicing is the
 * gallery's job.
 */
export function useSpaceActivityRows(
  spaceId: string,
  kind: SpaceActivityKind,
  enabled: boolean
): { rows: ExploreFeedRow[]; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery({
    // Unfiltered and ranked, which is what the card is: a top-six, not a view of someone's filters.
    queryKey: [...rowsQueryKey(spaceId, kind, 'best', NO_SPACE_ACTIVITY_FILTERS), 'first-page'] as const,
    enabled: enabled && spaceId !== '',
    staleTime: SPACE_ACTIVITY_STALE_TIME,
    queryFn: ({ signal }) =>
      fetchRowsPage({ spaceId, kind, sort: 'best', filters: NO_SPACE_ACTIVITY_FILTERS, after: null, signal }),
  });

  const rows = React.useMemo(() => data?.rows ?? [], [data?.rows]);

  return { rows, isLoading: enabled && isLoading, isError };
}

/**
 * The whole of one kind's list, a page at a time, in whatever order and narrowing was asked for.
 *
 * What the space's own tab scrolls through. Cursor-paged off the connection itself rather than the
 * ranked feed's window cursor, so a page is a page: no window is re-fetched to serve the back half
 * of it, and nothing is dropped between one and the next.
 *
 * `placeholderData` holds the rows already on screen while a new sort or topic is fetched. Dropping
 * to an empty list between the two reads as the filter having emptied the feed, which is the one
 * thing a reader cannot tell apart from it actually having done so.
 */
export function useSpaceActivityRowsInfinite(
  spaceId: string,
  kind: SpaceActivityKind,
  sort: SpaceActivitySort = 'best',
  filters: SpaceActivityFilters = NO_SPACE_ACTIVITY_FILTERS
) {
  const query = useInfiniteQuery({
    queryKey: [...rowsQueryKey(spaceId, kind, sort, filters), 'infinite'] as const,
    enabled: spaceId !== '',
    staleTime: SPACE_ACTIVITY_STALE_TIME,
    /*
     * Held rows are for a filter or a sort changing under the same list — not for a different one.
     *
     * `keepPreviousData` applies to every key change, `spaceId` included, so a component reused
     * across a space navigation would show the previous space's claims under the new space's
     * heading until it resolved. The old page carried a test against exactly that. Space and kind
     * are the list's identity; sort and filters are views of it.
     */
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey as readonly unknown[] | undefined;
      if (!previousKey) return previous;
      return previousKey[1] === spaceId && previousKey[2] === kind ? previous : undefined;
    },
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchRowsPage({ spaceId, kind, sort, filters, after: pageParam, signal }),
    // A connection that claims another page but hands back no cursor has no way to reach it, and
    // re-sending `null` would restart the list and scroll forever.
    getNextPageParam: (last: SpaceActivityRowsPage) => (last.hasNextPage ? (last.endCursor ?? undefined) : undefined),
  });

  const rows = React.useMemo(() => (query.data?.pages ?? []).flatMap(page => page.rows), [query.data?.pages]);

  return {
    rows,
    isLoading: query.isLoading,
    isError: query.isError,
    /** Rows are on screen but describe the previous filters; the current ones are still out. */
    isPending: query.isPlaceholderData,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    /**
     * Try the list again after a failure.
     *
     * `refetch` rather than `fetchNextPage`, because a failure can be either hop — the first page
     * or an appended one — and `refetch` covers both. The sentinel stops observing on an error, so
     * this is the only way back. Wrapped so it can be handed straight to an `onClick`, whose event
     * argument `refetch` would otherwise read as its options.
     */
    retry: () => void query.refetch(),
  };
}

/**
 * The topic menu for a space's claims: every topic carried by a claim that survives the current
 * search, counted over that same set.
 *
 * The tagged-claims facet, scoped to this space. Co-occurrence rather than a flat list (GEO-2696) —
 * counted over the claims that already carry every picked topic, so the menu answers "what else do
 * these carry" and nothing it offers can lead to an empty list. Counted through
 * `taggedEntityFilter`, which is the clause the rows are filtered by, so the menu and the list
 * cannot disagree about what is in the corpus.
 */
export function useSpaceClaimTopicFacet(spaceId: string, filters: SpaceActivityFilters, enabled: boolean) {
  /*
   * Held off until the search's ids are whole.
   *
   * `useTaggedClaimSearch` reports `settled` once its *first* page succeeds, which stays true for a
   * while before the accumulation above finishes — and this facet's filter carries those ids, so it
   * re-keyed and re-fired on every page. A broad search launched up to ten grouped-aggregate counts
   * to arrive at the one the menu draws. The options on screen are held meanwhile; see below.
   */
  const facet = useTaggedTopicFacet(
    DEBATE_TAG_ID,
    spaceTaggedClaimFilters(spaceId, filters),
    enabled && spaceId !== '' && !filters.isSearchPending
  );

  // The options stay while the next set is counted, rather than the menu emptying under a reader
  // who has it open. Reset on the space, because another space's topics are not these.
  const topics = useLastSettled(facet.topics, !facet.settled && facet.error === null, spaceId);

  return {
    topics,
    isLoading: facet.isLoading,
    /** Whether there are counts to draw at all; the menu renders a row without one rather than a 0. */
    settled: facet.settled,
    /**
     * The counts could not be read.
     *
     * `settled` is false on a failure as well as during a load, so a caller driving skeletons off
     * it alone draws them forever. The menu is still usable without counts — the topics are named —
     * so a failure drops the numbers rather than the menu.
     */
    error: facet.error,
  };
}

/**
 * How many pages of matched ids one search reads before it stops.
 *
 * `/search` answers 100 rows a page and is *not* scoped to a space — the space gate is applied
 * afterwards, in the graph filter these ids narrow — so a page is a hundred of the tag's global
 * matches, of which one space holds a fraction. Narrowing by the first page alone therefore lost
 * most of a broad search. Measured against the AI space:
 *
 *     "regulation"   40 matches globally   18 in-space either way
 *     "AI"          436 matches globally   76 in-space from page one, 223 read whole
 *     "should"    1,133 matches globally   14 in-space from page one,  86 read whole
 *
 * Ten pages covers every query measured. Past it the search is too broad to enumerate and the list
 * is a large subset rather than all of it, which is the same trade the first page was making —
 * only three orders of magnitude further along.
 */
const SEARCH_ID_PAGE_CAP = 10;

/**
 * The claims a search matched, as ids.
 *
 * Text never reaches the graph filter (GEO-2898): the app's `/search` endpoint resolves it against
 * the tagged corpus — fuzzy, stemmed, relevance-ranked — and the ids narrow the same filter the
 * topic menu is counted through. `null` means nothing is being searched for, which narrows nothing;
 * `[]` means nothing matched, which empties the list.
 */
export function useSpaceClaimSearch(search: string, enabled: boolean) {
  // The hub's own search debounce, constant included. It trims on both sides, so a query differing
  // from the one in flight only by a space just typed reads as settled rather than as pending.
  const { value, pending } = useDebouncedSearch(search);
  const result = useTaggedClaimSearch({ tagId: DEBATE_TAG_ID, search: value, enabled });

  const { hasNextPage, fetchNextPage, isFetchingNextPage, settled, error, refetch } = result;

  /*
   * Counted in requests asked for, not in pages that survived.
   *
   * `useTaggedClaimSearch` drops a page whose rows were all repeats of ones already seen — the
   * endpoint pages over per-space rows, so that happens — and those requests would then not count
   * against a cap read off `idPages`. The cap is a budget on what this hook spends, so it counts
   * what it spends. Starting at one, because the query fetches the first page itself and a counter
   * that only counted the effect's own calls made the real budget eleven. Reset per search, which
   * is what the cap is per.
   */
  const requestedRef = React.useRef({ forSearch: value, count: 1 });
  if (requestedRef.current.forSearch !== value) requestedRef.current = { forSearch: value, count: 1 };
  const atCap = requestedRef.current.count >= SEARCH_ID_PAGE_CAP;

  // Read every page before filtering, rather than narrowing by the first hundred. See the cap.
  React.useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || atCap) return;
    requestedRef.current.count += 1;
    fetchNextPage();
  }, [atCap, fetchNextPage, hasNextPage, isFetchingNextPage]);

  /**
   * Still collecting: the viewer has typed since the last answer, the first page is out, or there
   * are pages left to read. A failure is not settling — there is an error to draw, and holding the
   * page dim behind it would say the list is still coming.
   */
  const settling = error === null && (pending || !settled || (hasNextPage && !atCap));

  /**
   * The rows are narrowed by the last *complete* id set.
   *
   * A partial one re-keys the rows query once per page of ids arriving — a graph request each, for
   * an answer already known to be short — and shows a subset in between. So while a search
   * accumulates, the previous complete set stays in force and the rows on screen do not move; on a
   * first search there is no previous set and `null` is the unfiltered list this surface already
   * showed before the reader typed.
   *
   * Not `useLastSettled`, whose one difference is the one that matters here: before its first
   * settle it lets the unsettled value through, because its callers want a first load to show
   * something rather than nothing. Here that value is the partial id set this exists to withhold.
   */
  const lastCompleteRef = React.useRef<string[] | null>(null);
  if (!settling) lastCompleteRef.current = result.claimIds;
  const claimIds = settling ? lastCompleteRef.current : result.claimIds;

  return {
    claimIds,
    /**
     * The debounced text, for the topic menu.
     *
     * `useTaggedTopicFacet` resolves its *own* ids from `TaggedClaimFilters.search`, through this
     * same hook and the same `[tag, text]` key. Handing it the raw box instead would key a second
     * search per keystroke — a `/search` request each, and a facet-count request behind it — where
     * the debounced value shares the entry this hook already filled.
     */
    search: value,
    /** The list on screen is about the previous text. */
    isPending: settling,
    /** `/search` failed. The list cannot be narrowed, so the page says so instead of listing. */
    error,
    retry: refetch,
  };
}
