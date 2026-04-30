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

        valuesList(filter: { spaceId: { is: $spaceId } }) {
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
          bytes
          schedule
        }

        relationsList(filter: { spaceId: { is: $spaceId } }) {
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

export const entitiesOrderedByPropertyConnectionDocument = parse(
  ENTITIES_ORDERED_BY_PROPERTY_CONNECTION_SOURCE
) as TypedDocumentNode<any, any>;
