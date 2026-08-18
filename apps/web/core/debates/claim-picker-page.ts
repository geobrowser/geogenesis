import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { parse } from 'graphql';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';

/**
 * A page of published claims for the rematch picker, carrying only what the picker reads.
 *
 * The picker used to page through `useQueryEntities`, whose fragment pulls every value, every
 * relation and every related entity's values for each row — a quarter of a megabyte and several
 * seconds per fifty claims, of which the picker read six fields: the name, the description, the
 * spaces its name is set in (to work out its home space), whether it is factual, and its topics.
 * Filtering those lists on the server brings a page down to a few kilobytes.
 *
 * Shaped as the same structural subset of `Entity` the picker was already reading, so the helpers
 * that resolve a claim's home space, response kind and topics work unchanged on both sources.
 *
 * Hand-written rather than generated so it doesn't require regenerating `gql.ts`.
 */
const CLAIM_PICKER_PAGE_SOURCE = /* GraphQL */ `
  query ClaimPickerPage(
    $claimTypeId: UUID!
    $propertyIds: [UUID!]!
    $topicsPropertyId: UUID!
    $first: Int!
    $after: Cursor
    $filter: EntityFilter
  ) {
    entitiesConnection(first: $first, after: $after, typeId: $claimTypeId, filter: $filter) {
      pageInfo {
        endCursor
        hasNextPage
      }
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

type ClaimPickerPageQuery = {
  entitiesConnection: {
    pageInfo: { endCursor: string | null; hasNextPage: boolean } | null;
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

type ClaimPickerPageVariables = {
  claimTypeId: string;
  propertyIds: string[];
  topicsPropertyId: string;
  first: number;
  after?: string;
  filter: { name: { isNull: false; isNot: ''; includesInsensitive?: string } };
};

const claimPickerPageDocument = parse(CLAIM_PICKER_PAGE_SOURCE) as TypedDocumentNode<
  ClaimPickerPageQuery,
  ClaimPickerPageVariables
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

export type ClaimPickerPage = {
  entities: ClaimPickerEntity[];
  endCursor: string | null;
  hasNextPage: boolean;
};

export const CLAIM_PICKER_PAGE_SIZE = 50;

function decodeClaimPickerPage(data: ClaimPickerPageQuery): ClaimPickerPage {
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
  return {
    entities,
    endCursor: connection?.pageInfo?.endCursor ?? null,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
  };
}

export function fetchClaimPickerPage(
  { search, after }: { search: string; after?: string },
  signal?: AbortSignal
): Promise<ClaimPickerPage> {
  return Effect.runPromise(
    graphql({
      query: claimPickerPageDocument,
      decoder: decodeClaimPickerPage,
      variables: {
        claimTypeId: CLAIM_TYPE_ID,
        propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
        topicsPropertyId: TOPICS_PROPERTY_ID,
        first: CLAIM_PICKER_PAGE_SIZE,
        after,
        // Same filter the ORM built: nameless claims are excluded (the picker cannot show them) and
        // the search term is the case-insensitive substring `contains` maps to.
        filter: { name: { isNull: false, isNot: '', ...(search ? { includesInsensitive: search } : null) } },
      },
      signal,
    })
  );
}

/**
 * Deliberately not under `'debates'`: that root is what the gateway reconciles and refetches on
 * every (re)connect and what the debates mutations invalidate. This page comes from the knowledge
 * graph, not geo-chat, so a socket event says nothing about it — and a failing graph refetch under
 * that root would be read as a broken socket and recycle the connection over it.
 */
export const claimPickerPageQueryKey = (search: string, after: string | undefined) =>
  ['claim-picker', 'page', search, after ?? null] as const;

/**
 * One page of the picker's browsed claims. `keepPreviousData` holds the prior page on screen while
 * the next loads, which is what the caller reads as "a fetch is in flight" for its scroll sentinel.
 */
export function useClaimPickerPage({ search, after }: { search: string; after: string | undefined }) {
  const query = useQuery({
    queryKey: claimPickerPageQueryKey(search, after),
    queryFn: ({ signal }) => fetchClaimPickerPage({ search, after }, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  return {
    entities: query.data?.entities ?? EMPTY_ENTITIES,
    isLoading: query.isLoading,
    isPlaceholderData: query.isPlaceholderData,
    endCursor: query.data?.endCursor ?? null,
    hasNextPage: query.data?.hasNextPage ?? false,
  };
}

const EMPTY_ENTITIES: ClaimPickerEntity[] = [];
