'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '~/core/debates/use-debate-publishable-spaces';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { graphql } from '~/core/io/graphql-client';

import {
  SPACE_ACTIVITY_PAGE_SIZE,
  type SpaceActivityRowsPage,
  decodeSpaceActivityRows,
  spaceActivityRowsDocument,
  spaceActivityRowsVariables,
} from './space-activity-rows';
import {
  NO_SPACE_DEBATE_ACTIVITY_COUNTS,
  SPACE_DEBATE_ACTIVITY_COUNTS_QUERY,
  type SpaceActivityKind,
  type SpaceDebateActivityCounts,
  type SpaceDebateActivityCountsResult,
  decodeSpaceDebateActivityCounts,
  spaceDebateActivityCountsVariables,
} from './space-debate-activity';

const countsDocument = parse(SPACE_DEBATE_ACTIVITY_COUNTS_QUERY) as TypedDocumentNode<any, any>;

/**
 * None of this moves on anything a reader does on the page, and the Overview card asks for all of
 * it on every visit. A minute is what the profile's equivalent counts hold for, and for the same
 * reason.
 */
const SPACE_ACTIVITY_STALE_TIME = 60_000;

/** The list and the card share a key prefix, so one page is fetched once for both. */
const rowsQueryKey = (spaceId: string, kind: SpaceActivityKind) => ['space-activity-rows', spaceId, kind] as const;

function fetchRowsPage(spaceId: string, kind: SpaceActivityKind, after: string | null, signal?: AbortSignal) {
  return Effect.runPromise(
    graphql({
      query: spaceActivityRowsDocument,
      decoder: (response: Parameters<typeof decodeSpaceActivityRows>[1]) => decodeSpaceActivityRows(spaceId, response),
      variables: spaceActivityRowsVariables({ spaceId, kind, first: SPACE_ACTIVITY_PAGE_SIZE, after }),
      signal,
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
          query: countsDocument,
          decoder: (result: SpaceDebateActivityCountsResult) => decodeSpaceDebateActivityCounts(result),
          variables: spaceDebateActivityCountsVariables(spaceId),
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
    queryKey: [...rowsQueryKey(spaceId, kind), 'first-page'] as const,
    enabled: enabled && spaceId !== '',
    staleTime: SPACE_ACTIVITY_STALE_TIME,
    queryFn: ({ signal }) => fetchRowsPage(spaceId, kind, null, signal),
  });

  const rows = React.useMemo(() => data?.rows ?? [], [data?.rows]);

  return { rows, isLoading: enabled && isLoading, isError };
}

/**
 * The whole of one kind's ranking, a page at a time.
 *
 * What the space's own tab scrolls through. Cursor-paged off `entitiesConnection` rather than the
 * ranked feed's window cursor, so a page is a page: no window is re-fetched to serve the back half
 * of it, and nothing is dropped between one and the next.
 */
export function useSpaceActivityRowsInfinite(spaceId: string, kind: SpaceActivityKind) {
  const query = useInfiniteQuery({
    queryKey: [...rowsQueryKey(spaceId, kind), 'infinite'] as const,
    enabled: spaceId !== '',
    staleTime: SPACE_ACTIVITY_STALE_TIME,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => fetchRowsPage(spaceId, kind, pageParam, signal),
    // A connection that claims another page but hands back no cursor has no way to reach it, and
    // re-sending `null` would restart the list and scroll forever.
    getNextPageParam: (last: SpaceActivityRowsPage) => (last.hasNextPage ? (last.endCursor ?? undefined) : undefined),
  });

  const rows = React.useMemo(() => (query.data?.pages ?? []).flatMap(page => page.rows), [query.data?.pages]);

  return {
    rows,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
