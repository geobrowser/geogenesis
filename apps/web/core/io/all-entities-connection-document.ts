import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * Cursor-paginated entities query. Use `$after` (the prior page's `endCursor`)
 * for forward navigation; `getAllEntities` loops on `pageInfo.hasNextPage`
 * when callers ask for more than `ENTITIES_CONNECTION_MAX_FIRST` rows.
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
    $after: Cursor
    $offset: Int
    $filter: EntityFilter
    $orderBy: [EntitiesOrderBy!]
  ) {
    entitiesConnection(
      first: $limit
      after: $after
      offset: $offset
      filter: $filter
      orderBy: $orderBy
      spaceId: $spaceId
      spaceIds: $spaceIds
      typeId: $typeId
      typeIds: $typeIds
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

        # Lightweight cross-space view used to decide which spaces still hold
        # real entity data. The main valuesList/relationsList below are scoped
        # for display, so routing/search display needs this unscoped projection.
        allValuesList: valuesList(first: 1000) {
          spaceId
          propertyId
        }

        allRelationsList: relationsList(first: 1000) {
          spaceId
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

export const allEntitiesConnectionDocument = parse(ALL_ENTITIES_CONNECTION_SOURCE) as TypedDocumentNode<any, any>;
