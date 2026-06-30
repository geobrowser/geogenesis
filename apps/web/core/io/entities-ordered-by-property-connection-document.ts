import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * Cursor-paginated variant of the legacy `entitiesOrderedByProperty` field.
 * Returns an `EntitiesConnection` so we can drive forward navigation off
 * `pageInfo.endCursor` instead of offset arithmetic.
 *
 * Kept as a `parse()` document so it does not require updating the generated `gql.ts` map.
 */
const ENTITIES_ORDERED_BY_PROPERTY_CONNECTION_SOURCE = /* GraphQL */ `
  fragment PropertyFragment on PropertyInfo {
    id
    name
    dataTypeId
    dataTypeName
    renderableTypeId
    renderableTypeName
    format
    isType
  }

  query EntitiesOrderedByPropertyConnection(
    $propertyId: UUID
    $sortDirection: SortOrder
    $dataType: String
    $spaceId: UUID
    $spaceIds: [UUID!]
    $typeIds: [UUID!]
    $limit: Int
    $after: Cursor
    $offset: Int
    $filter: EntityFilter
  ) {
    entitiesOrderedByPropertyConnection(
      propertyId: $propertyId
      sortDirection: $sortDirection
      dataType: $dataType
      spaceIds: $spaceIds
      typeIds: $typeIds
      first: $limit
      after: $after
      offset: $offset
      filter: $filter
    ) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        id
        name
        description
        spaceIds
        updatedAt

        types {
          id
          name
        }

        # Field selections mirror the EntityValueFields / RelationFields /
        # RelationToEntity fragments in query-fragments.tsx. Kept inline because
        # this is a standalone parse() document, not part of gql codegen.
        valuesList(first: 1000, filter: { spaceId: { is: $spaceId } }) {
          spaceId
          property {
            ...PropertyFragment
          }
          text
          integer
          float
          point
          boolean
          time
          language
          unit
          datetime
          date
          decimal
          schedule
        }

        relationsList(first: 1000, filter: { spaceId: { is: $spaceId } }) {
          id
          spaceId
          position
          verified
          entityId
          fromEntity {
            id
            name
          }
          toEntity {
            id
            name
            types {
              id
            }
            valuesList {
              spaceId
              propertyId
              text
            }
          }
          toSpaceId
          type {
            id
            name
          }
        }
      }
    }
  }
`;

export const entitiesOrderedByPropertyConnectionDocument = parse(
  ENTITIES_ORDERED_BY_PROPERTY_CONNECTION_SOURCE
) as TypedDocumentNode<any, any>;

/**
 * Local-dev variant. The geo-migration-e2e GraphQL schema only declares
 * `spaceId` (singular) on this resolver and does not declare `typeIds` —
 * matching the pre-multi-space-filter shape. The plural variants are
 * dropped here so the document validates against the local API, with
 * type narrowing delegated to the `filter` arg instead.
 */
const ENTITIES_ORDERED_BY_PROPERTY_CONNECTION_LOCAL_DEV_SOURCE = /* GraphQL */ `
  fragment PropertyFragmentLocalDev on PropertyInfo {
    id
    name
    dataTypeId
    dataTypeName
    renderableTypeId
    renderableTypeName
    format
    isType
  }

  query EntitiesOrderedByPropertyConnectionLocalDev(
    $propertyId: UUID
    $sortDirection: SortOrder
    $dataType: String
    $spaceId: UUID
    $limit: Int
    $after: Cursor
    $offset: Int
    $filter: EntityFilter
  ) {
    entitiesOrderedByPropertyConnection(
      propertyId: $propertyId
      sortDirection: $sortDirection
      dataType: $dataType
      spaceId: $spaceId
      first: $limit
      after: $after
      offset: $offset
      filter: $filter
    ) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        id
        name
        description
        spaceIds
        updatedAt

        types {
          id
          name
        }

        valuesList(first: 1000, filter: { spaceId: { is: $spaceId } }) {
          spaceId
          property {
            ...PropertyFragmentLocalDev
          }
          text
          integer
          float
          point
          boolean
          time
          language
          unit
          datetime
          date
          decimal
          bytes
          schedule
        }

        relationsList(first: 1000, filter: { spaceId: { is: $spaceId } }) {
          id
          spaceId
          position
          verified
          entityId
          fromEntity {
            id
            name
          }
          toEntity {
            id
            name
            types {
              id
              name
            }
            valuesList {
              spaceId
              propertyId
              text
              integer
              float
              point
              boolean
              time
              datetime
              date
              decimal
              bytes
              schedule
            }
          }
          toSpaceId
          type {
            id
            name
          }
        }
      }
    }
  }
`;

export const entitiesOrderedByPropertyConnectionLocalDevDocument = parse(
  ENTITIES_ORDERED_BY_PROPERTY_CONNECTION_LOCAL_DEV_SOURCE
) as TypedDocumentNode<any, any>;
