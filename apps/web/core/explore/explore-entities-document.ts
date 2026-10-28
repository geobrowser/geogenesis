import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

const FRAGMENT = 'ExplorePropertyFragment';

/**
 * Like `allEntitiesConnectionDocument`, but scopes `valuesList` / `relationsList` to any of
 * the given spaces AND to just the property/relation types the card reads — so multi-space
 * explore feeds still decode cover/avatar/description without pulling every unrelated value.
 */
const exploreEntitiesConnectionSource = (pageInfo: string) => /* GraphQL */ `
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
      ${pageInfo}
      nodes {
        ${exploreCardNodeFields(FRAGMENT)}
      }
    }
  }
`;

export const exploreEntitiesConnectionDocument = parse(
  exploreEntitiesConnectionSource(`pageInfo {
        endCursor
        hasNextPage
      }`)
) as TypedDocumentNode<any, any>;

/**
 * The same query with no `pageInfo`, for the Fresh list. PostGraphile computes `hasNextPage` as an
 * `exists(...)` that re-runs the whole filter (~2s of a ~6.7s query), and the Fresh list only reads
 * its entities — never a cursor or a next-page flag.
 */
export const exploreEntitiesNoPageInfoConnectionDocument = parse(
  exploreEntitiesConnectionSource('')
) as TypedDocumentNode<any, any>;
