import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * A deliberately small index of a contextual feed's complete population.
 *
 * Asking `entitiesConnection` to order a Topic's relation-heavy predicate by ranking score makes
 * Postgres gather and sort the whole matching population before it can apply the page limit. The
 * same predicate is quick in its indexed created-at order, so this query transfers only the fields
 * needed to order Best or New. The app sorts that compact list, then fetches card data for the
 * visible ids only.
 */
const EXPLORE_COMPLETE_INDEX_SOURCE = /* GraphQL */ `
  query ExploreCompleteIndex(
    $limit: Int!
    $after: Cursor
    $filter: EntityFilter!
    $spaceIds: UUIDFilter!
    $typeIds: UUIDFilter!
  ) {
    entitiesConnection(
      first: $limit
      after: $after
      filter: $filter
      orderBy: [CREATED_AT_DESC]
      spaceIds: $spaceIds
      typeIds: $typeIds
    ) {
      nodes {
        id
        rankingScore
        createdAt
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export const exploreCompleteIndexDocument = parse(EXPLORE_COMPLETE_INDEX_SOURCE) as TypedDocumentNode<any, any>;
