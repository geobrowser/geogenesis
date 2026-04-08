import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';

/**
 * Mirrors the former `AllEntities` list query, but uses `entitiesConnection` so the API
 * does not reject `offset` values above 1000 (the `entities` field caps offset at 1000).
 * Callers must keep `first` (the `$limit` variable) at most 1000 per request; see
 * `getAllEntities`, which pages automatically for larger windows.
 *
 * Kept as a `parse()` document so it does not require updating the generated `gql.ts` map.
 */
const ALL_ENTITIES_CONNECTION_SOURCE = /* GraphQL */ `
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

  query AllEntitiesConnection(
    $spaceId: UUID
    $spaceIds: UUIDFilter
    $typeId: UUID
    $typeIds: UUIDFilter
    $limit: Int
    $offset: Int
    $filter: EntityFilter
    $orderBy: [EntitiesOrderBy!]
  ) {
    entitiesConnection(
      first: $limit
      offset: $offset
      filter: $filter
      orderBy: $orderBy
      spaceId: $spaceId
      spaceIds: $spaceIds
      typeId: $typeId
      typeIds: $typeIds
    ) {
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

export const allEntitiesConnectionDocument = parse(
  ALL_ENTITIES_CONNECTION_SOURCE
) as TypedDocumentNode<any, any>;
