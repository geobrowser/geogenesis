import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

const FRAGMENT = 'ExploreBestFragment';

/**
 * The "Best" sort — Phase A ranked feed, backed by `entities_ranked_for_feed`.
 *
 * Deliberately passes no `filter`. The other two sorts build one with
 * `buildFeedFilter`, but every clause of it is enforced inside the function now:
 *
 *   * name presence            -> migration 0075
 *   * system entities          -> 0076, keyed on the unforgeable System Type relation
 *   * data/text/ranking blocks -> `entity_type_exclusions` config
 *   * space and type scoping   -> 0077, as function arguments rather than filter clauses
 *   * the recency window       -> `createdAfter`, the function's own argument
 *
 * Sending them again would be redundant, and not free: `filter` combined with
 * `totalCount` and `edges` on this connection exceeds the statement timeout, because
 * totalCount scans the filtered candidate set while edges walks it again. This document
 * requests neither `totalCount` nor `filter`, which keeps it on the fast path — an
 * index-ordered walk of the ranking index that stops as soon as `first` rows are found.
 *
 * There is no `orderBy` either: ordering is the function's own
 * `ORDER BY ranking_score DESC, entity_id DESC`, and the cursor is offset-based over
 * that order. One consequence worth knowing: because cursors are offsets rather than
 * keys, entities scored while a user pages can shift rows under them. That matches how
 * the other sorts already behave and is acceptable for a feed, but it is not a stable
 * keyset cursor.
 */
const EXPLORE_BEST_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query ExploreBestConnection(
    $first: Int
    $after: Cursor
    $spaceIds: [UUID!]
    $typeIds: [UUID!]
    $createdAfter: String
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesRankedForFeedConnection(
      first: $first
      after: $after
      spaceIds: $spaceIds
      typeIds: $typeIds
      createdAfter: $createdAfter
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

export const exploreBestConnectionDocument = parse(EXPLORE_BEST_SOURCE) as TypedDocumentNode<any, any>;
