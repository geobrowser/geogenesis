import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';

/**
 * Lightweight cursor-paged `entitiesConnection` fetch used as the fallback
 * browse list after the scoped relations query exhausts. Intentionally omits
 * `valuesList` and `relationsList` — the filter dropdown only needs enough
 * data to render a row, and the full entity payload is too expensive for an
 * unconstrained (or loosely-constrained) type browse.
 */
const BROWSE_ENTITIES_BY_TYPE_SOURCE = /* GraphQL */ `
  query BrowseEntitiesByType($filter: EntityFilter, $first: Int, $after: Cursor) {
    entitiesConnection(first: $first, after: $after, filter: $filter, orderBy: NATURAL) {
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

export const browseEntitiesByTypeDocument = parse(
  BROWSE_ENTITIES_BY_TYPE_SOURCE
) as TypedDocumentNode<any, any>;