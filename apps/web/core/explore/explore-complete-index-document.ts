import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import type { EntityFilter, UuidFilter } from '~/core/gql/graphql';

import {
  type ExploreCompleteIndexNode,
  type ExploreIndexConnection,
  exploreIndexNodeFields,
} from './explore-index-selection';

/**
 * Compact entity-first index for contextual scopes without a direct relation entry point.
 * Only ordering/counting fields are fetched here; card data is fetched for the visible ids later.
 * Topic scopes use ExploreRelationIndex to avoid this ordered entity scan.
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
        ${exploreIndexNodeFields}
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export const exploreCompleteIndexDocument = parse(EXPLORE_COMPLETE_INDEX_SOURCE) as TypedDocumentNode<
  { entitiesConnection?: ExploreIndexConnection<ExploreCompleteIndexNode> },
  { limit: number; after: string | null; filter: EntityFilter; spaceIds: UuidFilter; typeIds: UuidFilter }
>;
