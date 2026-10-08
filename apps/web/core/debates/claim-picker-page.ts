import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { type UseQueryResult, useQueries, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';
import { POSITION_VOTE_KINDS, POSITION_VOTE_TYPES } from '~/core/profile/profile-facts';
import { collectCursorPages } from '~/core/sync/collect-cursor-pages';
import { normId } from '~/core/utils/norm-id';

/**
 * The rematch picker's projection of a claim, carrying only what the picker reads.
 *
 * `useQueryEntities` pulls every value, every relation and every related entity's values for each
 * row — a quarter of a megabyte and several seconds per fifty claims, of which the picker reads six
 * fields: the name, the description, the spaces its name is set in (to work out its home space),
 * whether it is factual, and its topics. Filtering those lists on the server brings a batch down to
 * a few kilobytes.
 *
 * Shaped as the same structural subset of `Entity` the picker was already reading, so the helpers
 * that resolve a claim's home space, response kind and topics work unchanged on both sources.
 *
 * Hand-written rather than generated so it doesn't require regenerating `gql.ts`.
 */
const CLAIM_PICKER_ENTITY_FIELDS = /* GraphQL */ `
  id
  name
  description
  spaceIds
  valuesList(first: 100, filter: { propertyId: { in: $propertyIds } }) {
    spaceId
    propertyId
    text
    boolean
  }
  relationsList(first: 100, filter: { typeId: { is: $topicsPropertyId } }) {
    # Topics are assigned per space, so which space the assignment was made in is part of the
    # answer rather than metadata about it. Without it a caller scoped to one space cannot tell
    # a topic assigned there from one assigned somewhere else entirely.
    spaceId
    toEntity {
      id
      name
    }
  }
`;

const CLAIM_PICKER_ENTITIES_SOURCE = /* GraphQL */ `
  query ClaimPickerEntities($claimTypeId: UUID!, $propertyIds: [UUID!]!, $topicsPropertyId: UUID!, $ids: [UUID!]!) {
    entitiesConnection(first: 100, typeId: $claimTypeId, filter: { id: { in: $ids } }) {
      nodes {
        ${CLAIM_PICKER_ENTITY_FIELDS}
      }
    }
  }
`;

type ClaimPickerEntityNode = {
  id: string;
  name: string | null;
  description: string | null;
  spaceIds: string[] | null;
  valuesList: Array<{
    spaceId: string;
    propertyId: string;
    text: string | null;
    boolean: boolean | null;
  } | null> | null;
  // Nullable, as `tagged-claims.ts` also models it: a relation can carry no space.
  relationsList: Array<{
    spaceId: string | null;
    toEntity: { id: string; name: string | null } | null;
  } | null> | null;
};

type ClaimPickerEntitiesQuery = {
  entitiesConnection: { nodes: Array<ClaimPickerEntityNode | null> | null } | null;
};

type ClaimPickerEntitiesVariables = {
  claimTypeId: string;
  propertyIds: string[];
  topicsPropertyId: string;
  ids: string[];
};

const claimPickerEntitiesDocument = parse(CLAIM_PICKER_ENTITIES_SOURCE) as TypedDocumentNode<
  ClaimPickerEntitiesQuery,
  ClaimPickerEntitiesVariables
>;

/** The subset of `Entity` the rematch picker reads. A full `Entity` satisfies it structurally. */
export type ClaimPickerEntity = {
  id: string;
  name: string | null;
  description: string | null;
  spaces: string[];
  values: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: string }>;
  relations: Array<{
    isDeleted?: boolean;
    type: { id: string };
    /**
     * The space the relation was written in.
     *
     * Optional so a full `Entity` still satisfies this, and nullable because the API models it that
     * way — a relation can carry no space at all. Both mean the same thing to a caller: the space is
     * not known, so it cannot be compared against one.
     */
    spaceId?: string | null;
    toEntity: { id: string; name: string | null };
  }>;
};

/** The graph caps `first` on `entitiesConnection`; ids are asked for in lists this long. */
export const CLAIM_PICKER_IDS_BATCH_SIZE = 100;

function decodeClaimPickerEntities(data: ClaimPickerEntitiesQuery): ClaimPickerEntity[] {
  return decodeClaimPickerNodes(data.entitiesConnection?.nodes);
}

function decodeClaimPickerNodes(nodes: Array<ClaimPickerEntityNode | null> | null | undefined): ClaimPickerEntity[] {
  const entities: ClaimPickerEntity[] = [];
  for (const node of nodes ?? []) {
    if (!node) continue;
    entities.push({
      id: node.id,
      name: node.name,
      description: node.description,
      spaces: node.spaceIds ?? [],
      values: (node.valuesList ?? []).flatMap(value => {
        if (!value) return [];
        // Match `Entity`'s decoding: booleans land as '1' / '0', text as itself.
        const decoded = value.boolean !== null ? (value.boolean ? '1' : '0') : value.text;
        if (decoded === null) return [];
        return [{ property: { id: value.propertyId }, spaceId: value.spaceId, value: decoded }];
      }),
      relations: (node.relationsList ?? []).flatMap(relation =>
        relation?.toEntity
          ? [
              {
                type: { id: TOPICS_PROPERTY_ID },
                spaceId: relation.spaceId,
                toEntity: { id: relation.toEntity.id, name: relation.toEntity.name },
              },
            ]
          : []
      ),
    });
  }
  return entities;
}

export function fetchClaimPickerEntities(ids: string[], signal?: AbortSignal): Promise<ClaimPickerEntity[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return Effect.runPromise(
    graphql({
      query: claimPickerEntitiesDocument,
      decoder: decodeClaimPickerEntities,
      variables: {
        claimTypeId: CLAIM_TYPE_ID,
        propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
        topicsPropertyId: TOPICS_PROPERTY_ID,
        ids,
      },
      signal,
    })
  );
}

/**
 * Deliberately not under `'debates'`: that root is what the gateway reconciles and refetches on
 * every (re)connect and what the debates mutations invalidate. These rows come from the knowledge
 * graph, not geo-chat, so a socket event says nothing about them — and a failing graph refetch
 * under that root would be read as a broken socket and recycle the connection over it.
 */
export const claimPickerEntitiesQueryKey = (ids: string[]) => ['claim-picker', 'entities', ids] as const;

/**
 * The picker's projection of a known set of claims — the ones the opponent has responded to. Asked
 * for in id-sorted batches so a claim joining the list re-fetches its batch and nothing else, and
 * the claim entity itself rarely changes, so a batch stays fresh for a while.
 */
/**
 * A batch's `refetchInterval`: every `pollMs` while the graph's answer is missing any of the batch's
 * ids (or there is no answer yet), and never once all are there. Off without `pollMs`.
 */
export function pollWhileMissing(
  batchSize: number,
  pollMs: number | undefined
): false | ((query: { state: { data?: unknown[] } }) => number | false) {
  if (!pollMs) return false;
  return query => ((query.state.data?.length ?? 0) < batchSize ? pollMs : false);
}

export function useClaimEntitiesByIds(
  ids: string[],
  {
    pollMissingMs,
  }: {
    /**
     * Re-ask a batch on this interval for as long as the graph is missing any of its ids. For ids
     * expected to appear shortly — a debate's claims, published minutes after extraction
     * (GEO-2870) — so a card gains its controls without the page being reloaded. Off by default.
     */
    pollMissingMs?: number;
  } = {}
) {
  const batches = React.useMemo(() => {
    const sorted = [...new Set(ids)].sort();
    const chunks: string[][] = [];
    for (let index = 0; index < sorted.length; index += CLAIM_PICKER_IDS_BATCH_SIZE) {
      chunks.push(sorted.slice(index, index + CLAIM_PICKER_IDS_BATCH_SIZE));
    }
    return chunks;
  }, [ids]);

  const combine = React.useCallback(
    (results: UseQueryResult<ClaimPickerEntity[]>[]) => ({
      entities: results.flatMap(result => result.data ?? []),
      isLoading: results.some(result => result.isLoading),
      error: results.find(result => result.error)?.error ?? null,
    }),
    []
  );

  return useQueries({
    queries: batches.map(batch => ({
      queryKey: claimPickerEntitiesQueryKey(batch),
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchClaimPickerEntities(batch, signal),
      staleTime: 5 * 60_000,
      refetchInterval: pollWhileMissing(batch.length, pollMissingMs),
    })),
    combine,
  });
}

/**
 * Every claim one person holds a position on, as the picker's projection, asked for by the person
 * rather than by id (GEO-2656).
 *
 * `useClaimEntitiesByIds` needs the ids first, and the ids come from the positions query, so the
 * claim entities could not be asked for until positions had landed. `votedBy` answers "the claims
 * this person holds a side on" directly, so this starts with positions rather than after them —
 * one dependent round trip less behind the opponent's tab and its badge.
 *
 * The same held-position filters as every other `votedBy` read (`POSITION_VOTE_KINDS`,
 * `POSITION_VOTE_TYPES`), so it names the same claims the positions query does: measured on the
 * five busiest testnet voters, the two sets were identical (218–302 claims each).
 *
 * It does not decide which of them the picker lists. That still takes the positions themselves —
 * which space each side was taken in — and geo-chat's session rows, so the caller joins this to
 * both exactly as it joined the by-id lookup.
 */
const CLAIM_PICKER_ENTITIES_VOTED_BY_SOURCE = /* GraphQL */ `
  query ClaimPickerEntitiesVotedBy(
    $userId: UUID!
    $kinds: [Int!]
    $types: [Int!]
    $claimTypeId: UUID!
    $propertyIds: [UUID!]!
    $topicsPropertyId: UUID!
    $first: Int!
    $after: Cursor
  ) {
    entitiesConnection(
      votedBy: $userId
      votedByKinds: $kinds
      votedByTypes: $types
      typeId: $claimTypeId
      first: $first
      after: $after
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${CLAIM_PICKER_ENTITY_FIELDS}
      }
    }
  }
`;

type ClaimPickerEntitiesVotedByQuery = {
  entitiesConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
    nodes: Array<ClaimPickerEntityNode | null> | null;
  } | null;
};

const claimPickerEntitiesVotedByDocument = parse(CLAIM_PICKER_ENTITIES_VOTED_BY_SOURCE) as TypedDocumentNode<
  ClaimPickerEntitiesVotedByQuery,
  Omit<ClaimPickerEntitiesVariables, 'ids'> & {
    userId: string;
    kinds: number[];
    types: number[];
    first: number;
    after?: string;
  }
>;

/**
 * Rows per `votedBy` page. The busiest testnet voter holds ~300 positions, so this is one request in
 * the ordinary case — the same size the profile's position index pages at.
 */
export const CLAIM_PICKER_VOTED_BY_PAGE_SIZE = 500;

export function fetchClaimPickerEntitiesVotedBy(
  profileSpaceId: string,
  signal?: AbortSignal
): Promise<ClaimPickerEntity[]> {
  return collectCursorPages(after =>
    Effect.runPromise(
      graphql({
        query: claimPickerEntitiesVotedByDocument,
        decoder: data => ({
          items: decodeClaimPickerNodes(data.entitiesConnection?.nodes),
          endCursor: data.entitiesConnection?.pageInfo?.endCursor ?? null,
          hasNextPage: data.entitiesConnection?.pageInfo?.hasNextPage ?? false,
        }),
        variables: {
          userId: profileSpaceId,
          kinds: [...POSITION_VOTE_KINDS],
          types: [...POSITION_VOTE_TYPES],
          claimTypeId: CLAIM_TYPE_ID,
          propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
          topicsPropertyId: TOPICS_PROPERTY_ID,
          first: CLAIM_PICKER_VOTED_BY_PAGE_SIZE,
          after,
        },
        signal,
      })
    )
  );
}

/** Beside the by-id batches, and outside `'debates'` for the same reason they are. */
export const claimPickerVotedByQueryKey = (profileSpaceId: string) =>
  ['claim-picker', 'voted-by', normId(profileSpaceId)] as const;

/**
 * {@link fetchClaimPickerEntitiesVotedBy} as a query. `entities` is `undefined` until an answer has
 * landed, which is how a caller tells "not asked yet" from "holds no positions".
 */
export function useClaimEntitiesVotedBy(profileSpaceId: string | null): {
  entities: ClaimPickerEntity[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: claimPickerVotedByQueryKey(profileSpaceId ?? ''),
    queryFn: ({ signal }) => fetchClaimPickerEntitiesVotedBy(profileSpaceId as string, signal),
    enabled: Boolean(profileSpaceId),
    // The set grows as the person answers, but nothing reads it for *which* claims: the caller walks
    // the positions query's ids and tops up any this answer is missing by id. So a stale answer
    // costs a by-id batch, never a missing row.
    staleTime: 5 * 60_000,
  });
  return { entities: query.data, isLoading: query.isLoading, error: query.error };
}
