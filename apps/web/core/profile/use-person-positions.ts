'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import { normId } from '~/core/utils/norm-id';

/**
 * Which claims a person voted on, newest first.
 *
 * Two facts decide this. **A vote's `userId` is the personal space id** — the
 * same id the debate relations point at and the same one in the route, not the
 * person entity. And **`voteKind` 1 and 2 are the position kinds**, stance and
 * veracity; the table holds others, and counting it unfiltered overstates the
 * figure threefold on the reference account.
 *
 * Ids only. `UserVote` carries an `objectId` and no way to traverse to the thing
 * itself, so the claims come from a second request — see `fetchExploreRowsByIds`.
 *
 * Paged by **offset, not cursor**. `after` on this connection answers 500 for
 * any cursor it just handed out, whatever the filter — so every page after the
 * first threw, react-query retried, and the infinite-scroll sentinel refired on
 * each attempt: a loop that loaded nothing. `offset` works and the ordering is
 * stable enough to page by it.
 */
const PERSON_VOTES_SOURCE = /* GraphQL */ `
  query PersonVotes($userId: UUID!, $first: Int, $offset: Int) {
    userVotesConnection(
      first: $first
      offset: $offset
      orderBy: VOTED_AT_DESC
      filter: { userId: { is: $userId }, or: [{ voteKind: { is: 1 } }, { voteKind: { is: 2 } }] }
    ) {
      pageInfo {
        hasNextPage
      }
      nodes {
        objectId
        voteKind
        votedAt
      }
    }
  }
`;

export const personVotesDocument = parse(PERSON_VOTES_SOURCE) as TypedDocumentNode<any, any>;

export type PersonPositionsPage = {
  /** Card rows, still missing what only a space lookup can answer. */
  rows: ExploreFeedRow[];
  /** Where the next page starts. Null once there is none. */
  nextOffset: number | null;
};

type VotesResponse = {
  userVotesConnection?: {
    pageInfo?: { hasNextPage?: boolean | null } | null;
    nodes?: ({ objectId?: string | null } | null)[] | null;
  } | null;
};

type VotePage = { ids: string[]; hasNextPage: boolean; seen: number };

function decodeVotes(response: VotesResponse): VotePage {
  const connection = response.userVotesConnection;

  // One claim, however many times they voted on it. Stance and veracity are
  // separate votes on the same claim, so somebody who took both would otherwise
  // appear twice in their own record. Order is preserved: first vote wins the
  // position, which is the most recent one.
  const seen = new Set<string>();
  const ids: string[] = [];
  const nodes = connection?.nodes ?? [];

  for (const node of nodes) {
    const id = node?.objectId;
    if (!id || seen.has(normId(id))) continue;
    seen.add(normId(id));
    ids.push(id);
  }

  return {
    ids,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
    // Votes read, not claims kept: the offset counts rows on the server, and
    // deduping stance against veracity here would otherwise walk the next page
    // back over the ones this one already dropped.
    seen: nodes.length,
  };
}

export function personPositionsQueryKey(spaceId: string) {
  return ['person-positions', ID.uuidToHex(spaceId)] as const;
}

export function usePersonPositions({
  spaceId,
  first = 20,
}: {
  /** The personal space. A vote's `userId` is this, not the person entity. */
  spaceId: string;
  first?: number;
}) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError } = useInfiniteQuery({
    queryKey: personPositionsQueryKey(spaceId),
    enabled: spaceId !== '',
    initialPageParam: 0,
    getNextPageParam: (page: PersonPositionsPage) => page.nextOffset,
    queryFn: async ({ pageParam, signal }): Promise<PersonPositionsPage> => {
      const votes = await Effect.runPromise(
        graphql({
          query: personVotesDocument,
          decoder: decodeVotes,
          variables: { userId: ID.uuidToHex(spaceId), first, offset: pageParam },
          signal,
        })
      );

      return {
        rows: await fetchExploreRowsByIds(votes.ids, signal),
        // A page that came back empty ends the list whatever `hasNextPage` says,
        // or the offset would stand still and the sentinel would ask forever.
        nextOffset: votes.hasNextPage && votes.seen > 0 ? pageParam + votes.seen : null,
      };
    },
    retry: 1,
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => (data?.pages ?? []).flatMap(page => page.rows), [data]);

  return { rows, isLoading, isError, isFetchingNextPage, hasNextPage: Boolean(hasNextPage), fetchNextPage };
}
