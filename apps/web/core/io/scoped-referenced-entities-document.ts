import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';

/**
 * Aggregates entities referenced by the table's data set via a given relation
 * property. Phrased as `entitiesConnection(backlinks: some: ...)` rather than
 * a `relationsConnection` aggregation so the result set is naturally
 * deduplicated to unique target entities (one row per entity, not one per
 * referencing relation) and the filter runs against the entities table,
 * which is dramatically smaller and better indexed than the relations table
 * for system properties like "Types".
 *
 * Kept as a `parse()` document so it does not require updating the generated
 * `gql.ts` map.
 */
const SCOPED_REFERENCED_ENTITIES_SOURCE = /* GraphQL */ `
  query ScopedReferencedEntities($filter: EntityFilter, $first: Int, $after: Cursor) {
    entitiesConnection(first: $first, after: $after, filter: $filter) {
      nodes {
        id
        name
        description
        spaceIds
        types {
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

export const scopedReferencedEntitiesDocument = parse(
  SCOPED_REFERENCED_ENTITIES_SOURCE
) as TypedDocumentNode<any, any>;