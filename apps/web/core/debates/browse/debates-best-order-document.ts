import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * The order the explore page's "Best" sort would put a space's debates in.
 *
 * Same source as that sort — `entities_ranked_for_feed`, ordered by the function's own
 * `ranking_score DESC, entity_id DESC` — narrowed to Debate-typed entities in one space. It asks
 * for ids alone: the feed already has every debate it needs from geo-chat and is only missing the
 * order to show them in.
 *
 * Deliberately no `filter`, no `totalCount` and no `orderBy`, for the reasons spelled out on
 * `exploreBestConnectionDocument` — the combination is what keeps this on the ranking index's fast
 * path rather than a scan that can exceed the statement timeout.
 *
 * No `createdAfter` either. The explore feed uses it for its time filter; a debate feed has no such
 * control, and windowing here would quietly drop older debates out of the ranking and strand them
 * at the end of the scroll.
 */
const DEBATES_BEST_ORDER_SOURCE = /* GraphQL */ `
  query DebatesBestOrder($first: Int, $after: Cursor, $spaceIds: [UUID!], $typeIds: [UUID!]) {
    entitiesRankedForFeedConnection(first: $first, after: $after, spaceIds: $spaceIds, typeIds: $typeIds) {
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        id
      }
    }
  }
`;

export const debatesBestOrderDocument = parse(DEBATES_BEST_ORDER_SOURCE) as TypedDocumentNode<any, any>;
