'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { useDebouncedSearch } from '~/core/debates/matchmaking/use-debounced-search';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import { useTaggedClaimSearch } from '~/core/debates/tagged-claim-search';
import { useTaggedTopicFacet } from '~/core/debates/tagged-claims';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '~/core/debates/use-debate-publishable-spaces';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
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
    placeholderData: keepPreviousData,
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
  const facet = useTaggedTopicFacet(
    DEBATE_TAG_ID,
    spaceTaggedClaimFilters(spaceId, filters),
    enabled && spaceId !== ''
  );

  return {
    topics: facet.topics,
    isLoading: facet.isLoading,
    /** Whether there are counts to draw at all; the menu renders a row without one rather than a 0. */
    settled: facet.settled,
  };
}

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

  return {
    claimIds: result.claimIds,
    /** The viewer has typed since the last answer, so the list on screen is about the old text. */
    isPending: pending || !result.settled,
  };
}
