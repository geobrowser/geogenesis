import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

const FRAGMENT = 'ExplorePropertyFragment';

/**
 * Like `allEntitiesConnectionDocument`, but scopes `valuesList` / `relationsList` to any of
 * the given spaces AND to just the property/relation types the card reads — so multi-space
 * explore feeds still decode cover/avatar/description without pulling every unrelated value.
 */
const EXPLORE_ENTITIES_CONNECTION_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query ExploreEntitiesConnection(
    $limit: Int
    $after: Cursor
    $filter: EntityFilter
    $orderBy: [EntitiesOrderBy!]
    $spaceIds: UUIDFilter!
    $typeIds: UUIDFilter
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesConnection(
      first: $limit
      after: $after
      filter: $filter
      orderBy: $orderBy
      spaceIds: $spaceIds
      typeIds: $typeIds
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

export const exploreEntitiesConnectionDocument = parse(EXPLORE_ENTITIES_CONNECTION_SOURCE) as TypedDocumentNode<
  any,
  any
>;
