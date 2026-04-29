import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { parse } from 'graphql';

import {
  EXPLORE_AVATAR_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
} from './explore-constants';

// Kept in sync with exploreEntitiesConnectionDocument so the shared decoder works.
const CARD_VALUE_PROPERTY_IDS = [
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_AVATAR_PROPERTY_ID,
];
const CARD_RELATION_TYPE_IDS = [SystemIds.COVER_PROPERTY, ContentIds.AVATAR_PROPERTY, SystemIds.TYPES_PROPERTY];

const valuePropertyIdList = CARD_VALUE_PROPERTY_IDS.map(id => `"${id}"`).join(', ');
const relationTypeIdList = CARD_RELATION_TYPE_IDS.map(id => `"${id}"`).join(', ');

// Mirrors `ExploreEntitiesConnection`'s selection set so the shared decoder/cards
// can render results from `entitiesOrderedByPropertyConnection` unchanged. Used
// by the "Top" sort, where `propertyId` is the integer score property.
const EXPLORE_ENTITIES_BY_PROPERTY_SOURCE = /* GraphQL */ `
  fragment ExploreByPropertyFragment on PropertyInfo {
    id
    name
    dataTypeId
    dataTypeName
    renderableTypeId
    renderableTypeName
    format
    isType
  }

  query ExploreEntitiesByPropertyConnection(
    $first: Int
    $after: Cursor
    $filter: EntityFilter
    $propertyId: UUID!
    $dataType: String!
    $sortDirection: SortOrder!
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesOrderedByPropertyConnection(
      first: $first
      after: $after
      filter: $filter
      propertyId: $propertyId
      dataType: $dataType
      sortDirection: $sortDirection
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
            ...ExploreByPropertyFragment
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

export const exploreEntitiesByPropertyConnectionDocument = parse(
  EXPLORE_ENTITIES_BY_PROPERTY_SOURCE
) as TypedDocumentNode<any, any>;
