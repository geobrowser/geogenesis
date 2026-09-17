import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * The order the explore page's "Best" sort would put a space's debates in.
 *
 * Same ranking as that sort — `ranking_score DESC, entity_id DESC` — narrowed to Debate-typed
 * entities in one space. It asks for ids alone: the feed already has every debate it needs from
 * geo-chat and is only missing the order to show them in.
 *
 * Reads `entitiesRankedForFeedByTypeConnection`, *not* the `entitiesRankedForFeedConnection` the
 * explore document uses. Same ranking function body; the difference is how the type predicate is
 * planned. The explore connection applies `type_ids` as a filter on a ranked index walk, so it has
 * to descend until it has collected `first` matches — and Debate has ~65 members against 48.9M
 * rows in `entity_ranking_scores`, so that walk crosses most of the table. The by-type connection
 * gathers the typed set first (GEO-2793, gaia #925). Measured against testnet at this document's
 * own `first: 100`, one space: **2.26s -> 0.33s**, identical rows.
 *
 * Explore's document stays on the original connection deliberately: it sends no `typeIds` at all
 * (it filters the returned rows instead), and with no type argument the ranked walk is the right
 * plan — 33ms. This one must keep passing `typeIds`; the by-type connection matches nothing
 * without it.
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
    entitiesRankedForFeedByTypeConnection(first: $first, after: $after, spaceIds: $spaceIds, typeIds: $typeIds) {
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
