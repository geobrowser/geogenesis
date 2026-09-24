import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

type CommentEntitiesConnectionQuery = {
  entitiesConnection?: {
    totalCount: number;
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
    nodes: unknown[];
  } | null;
};

type CommentEntitiesConnectionVariables = {
  targetEntityId: string;
  replyToTypeId: string;
  commentTypeId: string;
  first: number;
  after?: string;
};

type EntityCommentCountQuery = {
  entitiesConnection?: { totalCount: number } | null;
};

type EntityCommentCountVariables = Pick<
  CommentEntitiesConnectionVariables,
  'targetEntityId' | 'replyToTypeId' | 'commentTypeId'
>;

/**
 * Fetches Comment entities directly instead of walking a target entity's backlinks and then
 * hydrating the returned ids. The deterministic secondary id order keeps the cursor stable when
 * comments share a timestamp.
 *
 * Kept as parsed documents so this focused query does not require regenerating the global gql map.
 */
const COMMENT_ENTITIES_CONNECTION_SOURCE = /* GraphQL */ `
  fragment CommentEntityPropertyFields on PropertyInfo {
    id
    name
    dataTypeId
    dataTypeName
    renderableTypeId
    renderableTypeName
    format
    isType
  }

  query CommentEntitiesConnection(
    $targetEntityId: UUID!
    $replyToTypeId: UUID!
    $commentTypeId: UUID!
    $first: Int!
    $after: Cursor
  ) {
    entitiesConnection(
      first: $first
      after: $after
      typeId: $commentTypeId
      orderBy: [CREATED_AT_DESC, ID_ASC]
      filter: { relations: { some: { typeId: { is: $replyToTypeId }, toEntityId: { is: $targetEntityId } } } }
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        description
        spaceIds
        createdAt
        updatedAt

        types {
          id
          name
        }

        valuesList(first: 1000) {
          spaceId
          property {
            ...CommentEntityPropertyFields
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

        relationsList(first: 1000) {
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

const ENTITY_COMMENT_COUNT_SOURCE = /* GraphQL */ `
  query EntityCommentCount($targetEntityId: UUID!, $replyToTypeId: UUID!, $commentTypeId: UUID!) {
    entitiesConnection(
      typeId: $commentTypeId
      filter: { relations: { some: { typeId: { is: $replyToTypeId }, toEntityId: { is: $targetEntityId } } } }
    ) {
      totalCount
    }
  }
`;

export const commentEntitiesConnectionDocument = parse(COMMENT_ENTITIES_CONNECTION_SOURCE) as TypedDocumentNode<
  CommentEntitiesConnectionQuery,
  CommentEntitiesConnectionVariables
>;

export const entityCommentCountDocument = parse(ENTITY_COMMENT_COUNT_SOURCE) as TypedDocumentNode<
  EntityCommentCountQuery,
  EntityCommentCountVariables
>;
