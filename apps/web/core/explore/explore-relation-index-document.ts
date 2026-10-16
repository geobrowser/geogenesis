import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import type { RelationFilter } from '~/core/gql/graphql';

import {
  type ExploreCompleteIndexNode,
  type ExploreIndexConnection,
  exploreIndexNodeFields,
} from './explore-index-selection';

export type ExploreRelationIndexConnection = ExploreIndexConnection<{
  fromEntity?: ExploreCompleteIndexNode | null;
} | null>;

/**
 * Start with the matching relations instead of scanning entities in creation order for backlinks.
 * The caller exhausts the cursor, deduplicates source entities, and applies Best/New ordering to
 * the same compact fields used by ExploreCompleteIndex. No card data or totalCount is needed here.
 */
export const exploreRelationIndexDocument = parse(/* GraphQL */ `
  query ExploreRelationIndex($filter: RelationFilter!, $first: Int!, $after: Cursor) {
    relationsConnection(filter: $filter, first: $first, after: $after) {
      nodes {
        fromEntity {
          ${exploreIndexNodeFields}
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`) as TypedDocumentNode<
  { relationsConnection?: ExploreRelationIndexConnection },
  { filter: RelationFilter; first: number; after: string | null }
>;
