'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import {
  type ExploreCardEntity,
  type ExploreFeedRow,
  buildExploreFeedRows,
  decodeExploreCardEntity,
} from '~/core/explore/explore-card-item';
import { exploreCardNodeFields, exploreCardPropertyFragment } from '~/core/explore/explore-card-selection';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';
import { validateSpaceId } from '~/core/utils/utils';

const FRAGMENT = 'PersonPositionsFragment';

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
 * itself, so the claims are fetched in a second request — see below.
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

/**
 * The claims those votes were cast on.
 *
 * The per-entity selection is the explore feed's own, so these decode into
 * exactly the item an `ExploreFeedCard` renders — same title, description,
 * thumbnail, types, timestamp and comment count, resolved by the same code
 * rather than by an approximation of it.
 *
 * Unscoped to spaces: a person's positions span the whole graph, so there is no
 * space list to narrow by before the rows say which spaces they came from.
 */
const POSITION_CLAIMS_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query PositionClaims($ids: [UUID!]) {
    entitiesConnection(filter: { id: { in: $ids } }, first: 100) {
      nodes {
        ${exploreCardNodeFields(FRAGMENT, { scopeListsToSpaces: false })}
      }
    }
  }
`;

export const personVotesDocument = parse(PERSON_VOTES_SOURCE) as TypedDocumentNode<any, any>;
export const positionClaimsDocument = parse(POSITION_CLAIMS_SOURCE) as TypedDocumentNode<any, any>;

export type PersonPositionsPage = {
  /** Card rows, still missing what only a space lookup can answer. */
  rows: ExploreFeedRow[];
  endCursor: string | null;
  hasNextPage: boolean;
};

const EMPTY_PAGE: PersonPositionsPage = { rows: [], endCursor: null, hasNextPage: false };

type VotesResponse = {
  userVotesConnection?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    nodes?: ({ objectId?: string | null } | null)[] | null;
  } | null;
};

type ClaimsResponse = { entitiesConnection?: { nodes?: unknown[] | null } | null };

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

function decodeClaims(response: ClaimsResponse): ExploreCardEntity[] {
  const entities: ExploreCardEntity[] = [];

  for (const node of response.entitiesConnection?.nodes ?? []) {
    const decoded = decodeExploreCardEntity(node);
    if (decoded) entities.push(decoded);
  }

  return entities;
}

export function personPositionsQueryKey(spaceId: string, after: string | null) {
  return ['person-positions', ID.uuidToHex(spaceId), after] as const;
}

export function usePersonPositions({
  spaceId,
  first = 20,
  after,
}: {
  /** The personal space. A vote's `userId` is this, not the person entity. */
  spaceId: string;
  first?: number;
  after?: string;
}) {
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: personPositionsQueryKey(spaceId, after ?? null),
    enabled: spaceId !== '',
    queryFn: async ({ signal }) => {
      const votes = await Effect.runPromise(
        graphql({
          query: personVotesDocument,
          decoder: decodeVotes,
          variables: { userId: ID.uuidToHex(spaceId), first, after },
          signal,
        })
      );

      if (votes.ids.length === 0) {
        return { ...EMPTY_PAGE, endCursor: votes.endCursor, hasNextPage: votes.hasNextPage };
      }

      const entities = await Effect.runPromise(
        graphql({
          query: positionClaimsDocument,
          decoder: decodeClaims,
          variables: { ids: votes.ids.map(ID.uuidToHex) },
          signal,
        })
      );

      // Back into the order they were voted in. The entity query answers in its
      // own order, and a record sorted by whatever the index returned is not
      // sorted by anything the reader can see.
      const byId = new Map(entities.map(entity => [normId(entity.id), entity]));
      const ordered = votes.ids
        .map(id => byId.get(normId(id)))
        .filter((entity): entity is ExploreCardEntity => entity !== undefined);

      const openableSpaceIds = new Set(ordered.flatMap(e => e.spaces.filter(validateSpaceId).map(normId)));

      return {
        // No membership context, so the card renders with its Join button hidden
        // rather than in a state this query cannot determine.
        rows: buildExploreFeedRows(ordered, openableSpaceIds, new Set()),
        endCursor: votes.endCursor,
        hasNextPage: votes.hasNextPage,
      };
    },
    // Holds the page being read while the next loads, so stepping does not
    // collapse the list under the reader.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return { page: data ?? EMPTY_PAGE, isLoading, isPlaceholderData };
}
