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
 * Paged by **cursor, not offset**, which is what the rest of the repo does —
 * see `fetchRelationsByToEntityIds`, which says why in one line. The server
 * rejects any `offset` above 1000, so offset paging silently caps a person's
 * record at 1000 vote rows and then errors on the page that would pass it.
 * `after` has no such ceiling.
 *
 * It was offset for a while, and the reason is worth keeping: `after` really
 * did answer 500 for the cursor this connection had just issued (GEO-2916).
 * `user_votes` had no primary key, so its cursors encoded a bare row offset —
 * gaia #937 gave the table one, and the cursors have worked since.
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
        voteType
        voteKind
        votedAt
      }
    }
  }
`;

export const personVotesDocument = parse(PERSON_VOTES_SOURCE) as TypedDocumentNode<any, any>;

/** Which way somebody came down on a claim. */
export type Stance = 'agree' | 'disagree';

export type PersonPositionsPage = {
  /** Card rows, still missing what only a space lookup can answer. */
  rows: ExploreFeedRow[];
  /** Which side this person took, by claim id. Absent where they only rated veracity. */
  stanceByClaimId: Record<string, Stance>;
  /** The cursor the next page starts after. Null once there is none. */
  nextCursor: string | null;
};

type VoteNode = { objectId?: string | null; voteType?: number | null; voteKind?: number | null };

type VotesResponse = {
  userVotesConnection?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    nodes?: (VoteNode | null)[] | null;
  } | null;
};

type VotePage = {
  ids: string[];
  stanceByClaimId: Record<string, Stance>;
  hasNextPage: boolean;
  endCursor: string | null;
};

/**
 * `voteType` 0 is agree and 1 is disagree; 2 is neither and carries no side.
 *
 * Measured on the reference account: 96 agree, 83 disagree, 4 of the third
 * across 183 stance votes.
 */
function stanceOf(node: VoteNode): Stance | null {
  if (node.voteType === 0) return 'agree';
  if (node.voteType === 1) return 'disagree';
  return null;
}

function decodeVotes(response: VotesResponse): VotePage {
  const connection = response.userVotesConnection;

  // One claim, however many times they voted on it. Stance and veracity are
  // separate votes on the same claim, so somebody who took both would otherwise
  // appear twice in their own record. Order is preserved: first vote wins the
  // position, which is the most recent one.
  const seen = new Set<string>();
  const ids: string[] = [];
  const stanceByClaimId: Record<string, Stance> = {};
  const nodes = connection?.nodes ?? [];

  for (const node of nodes) {
    const id = node?.objectId;
    if (!id) continue;
    const key = normId(id);

    // The side they took, from the stance vote. `voteKind` 2 is veracity — a
    // judgement about whether the claim is *true*, which is a different question
    // from whether they agree with it — so it never sets the badge. A claim they
    // only rated for veracity carries no side, which is the honest answer.
    if (node.voteKind === 1) {
      const stance = stanceOf(node);
      if (stance && !(key in stanceByClaimId)) stanceByClaimId[key] = stance;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }

  return {
    ids,
    stanceByClaimId,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
    // The server's own place-marker, so it counts vote rows rather than the
    // claims left after deduping. Advancing by the kept count would walk the
    // next page back over rows this one already collapsed.
    endCursor: connection?.pageInfo?.endCursor ?? null,
  };
}

/** Exposed for tests: the decode is where `voteKind` and `voteType` get confused. */
export const decodeVotesForTest = decodeVotes;

/**
 * Every page as one list.
 *
 * Deduped *across* pages, not only within one. `decodeVotes` collapses a claim's
 * stance and veracity votes into one card among the twenty rows it was handed,
 * so a claim whose two votes fall either side of a page boundary escaped it
 * entirely — rendered twice, with two React keys the same.
 *
 * First seen wins, for the rows and for the stance. Pages arrive newest-first,
 * so a later page holds older votes; merging their stances over the top — which
 * is what `Object.assign` did — let the older vote decide the badge.
 */
export function mergePositionPages(pages: readonly PersonPositionsPage[]): {
  rows: ExploreFeedRow[];
  stanceByClaimId: Record<string, Stance>;
} {
  const seen = new Set<string>();
  const rows: ExploreFeedRow[] = [];
  const stanceByClaimId: Record<string, Stance> = {};

  for (const page of pages) {
    for (const [id, stance] of Object.entries(page.stanceByClaimId)) {
      if (!(id in stanceByClaimId)) stanceByClaimId[id] = stance;
    }

    for (const row of page.rows) {
      const key = normId(row.entityId);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return { rows, stanceByClaimId };
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
    initialPageParam: null as string | null,
    getNextPageParam: (page: PersonPositionsPage) => page.nextCursor,
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
        stanceByClaimId: votes.stanceByClaimId,
        // A page with no cursor ends the list whatever `hasNextPage` says, or
        // the same cursor would be asked for again and the sentinel would fire
        // forever against an unmoving list.
        nextCursor: votes.hasNextPage ? votes.endCursor : null,
      };
    },
    retry: 1,
    staleTime: 30_000,
  });

  const { rows, stanceByClaimId } = React.useMemo(() => mergePositionPages(data?.pages ?? []), [data]);

  return {
    rows,
    stanceByClaimId,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage: Boolean(hasNextPage),
    fetchNextPage,
  };
}
