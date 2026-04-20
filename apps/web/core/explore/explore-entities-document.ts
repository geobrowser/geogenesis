import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { parse } from 'graphql';

import {
  EXPLORE_AVATAR_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
} from './explore-constants';

// Only the four property IDs and the two relation-type IDs we actually read per entity.
// Narrowing these on the server slashes payload size — most entities have dozens of
// unrelated values/relations we'd otherwise serialize, ship, and decode for nothing.
const CARD_VALUE_PROPERTY_IDS = [
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_AVATAR_PROPERTY_ID,
];
const CARD_RELATION_TYPE_IDS = [
  SystemIds.COVER_PROPERTY,
  ContentIds.AVATAR_PROPERTY,
  // `types` relation — used to derive space-scoped type tags.
  SystemIds.TYPES_PROPERTY,
];

const valuePropertyIdList = CARD_VALUE_PROPERTY_IDS.map(id => `"${id}"`).join(', ');
const relationTypeIdList = CARD_RELATION_TYPE_IDS.map(id => `"${id}"`).join(', ');

/**
 * Like `allEntitiesConnectionDocument`, but scopes `valuesList` / `relationsList` to any of
 * the given spaces AND to just the property/relation types the card reads — so multi-space
 * explore feeds still decode cover/avatar/description without pulling every unrelated value.
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
        createdAt

        backlinks(filter: { typeId: { is: "310d4a240e5b451cb2151bfce40d0fe6" } }) {
          totalCount
        }

        types {
          id
          name
        }

        valuesList(filter: {
          spaceId: { in: $spaceIdsForLists }
          propertyId: { in: [${valuePropertyIdList}] }
        }) {
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

        relationsList(filter: {
          spaceId: { in: $spaceIdsForLists }
          typeId: { in: [${relationTypeIdList}] }
        }) {
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
