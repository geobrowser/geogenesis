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
 */
const PERSON_VOTES_SOURCE = /* GraphQL */ `
  query PersonVotes($userId: UUID!, $first: Int, $after: Cursor) {
    userVotesConnection(
      first: $first
      after: $after
      orderBy: VOTED_AT_DESC
      filter: { userId: { is: $userId }, or: [{ voteKind: { is: 1 } }, { voteKind: { is: 2 } }] }
    ) {
      pageInfo {
        hasNextPage
        endCursor
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
  endCursor: string | null;
  hasNextPage: boolean;
};

type VotesResponse = {
  userVotesConnection?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    nodes?: ({ objectId?: string | null } | null)[] | null;
  } | null;
};

type VotePage = { ids: string[]; endCursor: string | null; hasNextPage: boolean };

function decodeVotes(response: VotesResponse): VotePage {
  const connection = response.userVotesConnection;

  // One claim, however many times they voted on it. Stance and veracity are
  // separate votes on the same claim, so somebody who took both would otherwise
  // appear twice in their own record. Order is preserved: first vote wins the
  // position, which is the most recent one.
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const node of connection?.nodes ?? []) {
    const id = node?.objectId;
    if (!id || seen.has(normId(id))) continue;
    seen.add(normId(id));
    ids.push(id);
  }

  return {
    ids,
    endCursor: connection?.pageInfo?.endCursor ?? null,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
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
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: personPositionsQueryKey(spaceId),
    enabled: spaceId !== '',
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: PersonPositionsPage) => (page.hasNextPage ? (page.endCursor ?? undefined) : undefined),
    queryFn: async ({ pageParam, signal }): Promise<PersonPositionsPage> => {
      const votes = await Effect.runPromise(
        graphql({
          query: personVotesDocument,
          decoder: decodeVotes,
          variables: { userId: ID.uuidToHex(spaceId), first, after: pageParam },
          signal,
        })
      );

      return {
        rows: await fetchExploreRowsByIds(votes.ids, signal),
        endCursor: votes.endCursor,
        hasNextPage: votes.hasNextPage,
      };
    },
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => (data?.pages ?? []).flatMap(page => page.rows), [data]);

  return { rows, isLoading, isFetchingNextPage, hasNextPage: Boolean(hasNextPage), fetchNextPage };
}
