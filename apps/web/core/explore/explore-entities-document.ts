import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';

/**
 * Like `allEntitiesConnectionDocument`, but scopes `valuesList` / `relationsList` to any of
 * the given spaces so multi-space explore feeds still decode cover/avatar/description.
 */
const EXPLORE_ENTITIES_CONNECTION_SOURCE = /* GraphQL */ `
  fragment ExplorePropertyFragment on PropertyInfo {
    id
    name
    dataTypeId
    dataTypeName
    renderableTypeId
    renderableTypeName
    format
    isType
  }

  query ExploreEntitiesConnection(
    $spaceIds: UUIDFilter
    $typeIds: UUIDFilter
    $limit: Int
    $offset: Int
    $filter: EntityFilter
    $orderBy: [EntitiesOrderBy!]
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesConnection(
      first: $limit
      offset: $offset
      filter: $filter
      orderBy: $orderBy
      spaceIds: $spaceIds
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

        valuesList(filter: { spaceId: { in: $spaceIdsForLists } }) {
          spaceId
          property {
            ...ExplorePropertyFragment
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

        relationsList(filter: { spaceId: { in: $spaceIdsForLists } }) {
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
            valuesList(filter: { spaceId: { in: $spaceIdsForLists } }) {
              spaceId
              property {
                ...ExplorePropertyFragment
              }
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

export const exploreEntitiesConnectionDocument = parse(
  EXPLORE_ENTITIES_CONNECTION_SOURCE
) as TypedDocumentNode<any, any>;
