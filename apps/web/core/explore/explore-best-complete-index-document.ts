import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * A deliberately small index of the complete population for contextual Best feeds.
 *
 * Asking `entitiesConnection` to order a Topic's relation-heavy predicate by ranking score makes
 * Postgres gather and sort the whole matching population before it can apply the page limit. The
 * same predicate is quick in its indexed created-at order, so this query transfers only the id and
 * score. The app sorts that compact list, then fetches card data for the visible ids only.
 */
const EXPLORE_BEST_COMPLETE_INDEX_SOURCE = /* GraphQL */ `
  query ExploreBestCompleteIndex(
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
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export const exploreBestCompleteIndexDocument = parse(EXPLORE_BEST_COMPLETE_INDEX_SOURCE) as TypedDocumentNode<
  any,
  any
>;
