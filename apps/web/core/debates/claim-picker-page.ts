import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';

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
const CLAIM_PICKER_ENTITIES_SOURCE = /* GraphQL */ `
  query ClaimPickerEntities($claimTypeId: UUID!, $propertyIds: [UUID!]!, $topicsPropertyId: UUID!, $ids: [UUID!]!) {
    entitiesConnection(first: 100, typeId: $claimTypeId, filter: { id: { in: $ids } }) {
      nodes {
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
          toEntity {
            id
            name
          }
        }
      }
    }
  }
`;

type ClaimPickerEntitiesQuery = {
  entitiesConnection: {
    nodes: Array<{
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
      relationsList: Array<{ toEntity: { id: string; name: string | null } | null } | null> | null;
    } | null> | null;
  } | null;
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
  relations: Array<{ isDeleted?: boolean; type: { id: string }; toEntity: { id: string; name: string | null } }>;
};

/** The graph caps `first` on `entitiesConnection`; ids are asked for in lists this long. */
export const CLAIM_PICKER_IDS_BATCH_SIZE = 100;

function decodeClaimPickerEntities(data: ClaimPickerEntitiesQuery): ClaimPickerEntity[] {
  const connection = data.entitiesConnection;
  const entities: ClaimPickerEntity[] = [];
  for (const node of connection?.nodes ?? []) {
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
          ? [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: relation.toEntity.id, name: relation.toEntity.name } }]
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
export function useClaimEntitiesByIds(ids: string[]) {
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
    })),
    combine,
  });
}
