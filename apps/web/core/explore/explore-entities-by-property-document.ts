import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

const FRAGMENT = 'ExploreByPropertyFragment';

// Shares `ExploreEntitiesConnection`'s selection set (see explore-card-selection) so the
// shared decoder/cards can render results from `entitiesOrderedByPropertyConnection`
// unchanged. Used by the "Top" sort, where `propertyId` is the integer score property.
const EXPLORE_ENTITIES_BY_PROPERTY_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query ExploreEntitiesByPropertyConnection(
    $first: Int
    $after: Cursor
    $filter: EntityFilter
    $propertyId: UUID!
    $dataType: String!
    $sortDirection: SortOrder!
    $spaceIds: [UUID!]!
    $typeIds: [UUID!]
    $spaceIdsForLists: [UUID!]!
    $includeWithoutValue: Boolean
  ) {
    entitiesOrderedByPropertyConnection(
      first: $first
      after: $after
      filter: $filter
      propertyId: $propertyId
      dataType: $dataType
      sortDirection: $sortDirection
      spaceIds: $spaceIds
      typeIds: $typeIds
      includeWithoutValue: $includeWithoutValue
    ) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        ${exploreCardNodeFields(FRAGMENT)}
      }
    }
  }
`;

export const exploreEntitiesByPropertyConnectionDocument = parse(
  EXPLORE_ENTITIES_BY_PROPERTY_SOURCE
) as TypedDocumentNode<any, any>;
