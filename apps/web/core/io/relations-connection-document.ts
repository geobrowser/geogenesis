import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * Cursor-paginated relation query used by relation data blocks. Kept as a
 * parsed document so relation-block work can move without requiring GraphQL
 * codegen every time the projection changes.
 */
const RELATIONS_CONNECTION_SOURCE = /* GraphQL */ `
  query RelationsConnection(
    $filter: RelationFilter
    $first: Int
    $after: Cursor
    $offset: Int
    $orderBy: [RelationsOrderBy!]
  ) {
    relationsConnection(first: $first, after: $after, offset: $offset, filter: $filter, orderBy: $orderBy) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
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
`;

export const relationsConnectionDocument = parse(RELATIONS_CONNECTION_SOURCE) as TypedDocumentNode<any, any>;
