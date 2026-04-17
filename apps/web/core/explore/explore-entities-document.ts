import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';

import { EXPLORE_COMMENT_REPLY_TO_TYPE_ID } from './explore-constants';

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
    $limit: Int
    $after: Cursor
    $filter: EntityFilter
    $orderBy: [EntitiesOrderBy!]
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesConnection(
      first: $limit
      after: $after
      filter: $filter
      orderBy: $orderBy
      spaceIds: $spaceIds
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

        backlinks(filter: { typeId: { is: "${EXPLORE_COMMENT_REPLY_TO_TYPE_ID}" } }) {
          totalCount
        }

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

export const exploreEntitiesConnectionDocument = parse(
  EXPLORE_ENTITIES_CONNECTION_SOURCE
) as TypedDocumentNode<any, any>;
