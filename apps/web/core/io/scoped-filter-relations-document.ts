import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';

/**
 * Aggregates relation targets across the whole graph for a given
 * `(fromEntityType, relationType, toEntityType)` triple, so the table-filter
 * dropdown can surface every entity referenced by the table's data set —
 * not just rows currently hydrated in the local sync store.
 *
 * Kept as a `parse()` document so it does not require updating the generated
 * `gql.ts` map.
 */
const SCOPED_FILTER_RELATIONS_SOURCE = /* GraphQL */ `
  query ScopedFilterRelations($filter: RelationFilter, $first: Int, $after: Cursor) {
    relationsConnection(first: $first, after: $after, filter: $filter) {
      nodes {
        toEntityId
        toEntity {
          id
          name
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export const scopedFilterRelationsDocument = parse(SCOPED_FILTER_RELATIONS_SOURCE) as TypedDocumentNode<any, any>;