import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { exploreCardNodeFields, exploreCardPropertyFragment } from './explore-card-selection';

const FRAGMENT = 'ExploreBestByTypeCardProperty';

/**
 * "Best", narrowed to a set of types by the SERVER rather than by us.
 *
 * ## Why this exists
 *
 * `exploreBestConnectionDocument` deliberately sends no `typeIds` (GEO-2793): supplying them
 * made `entities_ranked_for_feed` abandon its ranked index walk, which cost 5.8s for the twelve
 * Explore types and a statement timeout for one rare type. So the whitelist was applied to the
 * returned rows instead — correct, but **best-effort by yield**: a page can only contain as many
 * of a type as happened to land in the fetched window.
 *
 * Measured against production, the 66-row window Best actually fetches contains:
 *
 *     Claim 47   Debate 15   News story 3   Bounty 1
 *
 * So filtering to News story client-side yields **3 rows for a 22-row page**, and Debate yields
 * 15. That is the mechanism behind "the feed is all Claims" — distinct from the ranking problem
 * gaia #927 fixed, and not fixable by ranking, because the rows simply are not in the window.
 *
 * Server-side filtering makes it exact: ask for 22 News stories, get 22.
 *
 * ## Why it is safe now and was not before
 *
 * gaia #933 repoints `entities_ranked_for_feed_by_type` at the denormalised
 * `entity_type_ranking` table, so a type-scoped read is an ordered index walk that terminates
 * at the limit regardless of how many members the type has. Before that this connection used a
 * semi-join that gathered the whole type first — 11.4s for Claim, which is in the default
 * selection, so routing Explore through it would have been far worse than the yield problem.
 *
 * ## `offset`, not `after`
 *
 * This connection is paginated by explicit `offset` rather than an opaque cursor, which the
 * untyped document uses. That is not a preference: `maxPerType` must be at least
 * `offset + first` to be exact, and a `["natural", N]` cursor is documented as opaque — deriving
 * depth from its internals would couple the feed to PostGraphile's cursor encoding and break
 * silently if it ever changed. With an explicit offset the cap is arithmetic we own.
 *
 * ## `maxPerType` is a correctness argument, not a tuning knob
 *
 * It caps each type's candidate list *before* the global ordering, so a value below
 * `offset + first` silently returns short — the same class of bug this document exists to fix.
 * `offset + first` is the smallest provably exact value: taking the top N of each type
 * guarantees the global top N is among them. It is computed at the call site, never defaulted
 * here.
 *
 * **This document cannot be deployed before gaia #933 is.** `maxPerType` does not exist in the
 * schema until that migration ships, and a query naming an unknown argument fails validation
 * outright — which would break Explore entirely rather than degrade it.
 */
const EXPLORE_BEST_BY_TYPE_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query ExploreBestByTypeConnection(
    $first: Int
    $offset: Int
    $spaceIds: [UUID!]
    $typeIds: [UUID!]
    $createdAfter: String
    $filter: EntityFilter
    $maxPerType: Int
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesRankedForFeedByTypeConnection(
      first: $first
      offset: $offset
      spaceIds: $spaceIds
      typeIds: $typeIds
      createdAfter: $createdAfter
      filter: $filter
      maxPerType: $maxPerType
    ) {
      pageInfo {
        hasNextPage
      }
      nodes {
        ${exploreCardNodeFields(FRAGMENT)}
      }
    }
  }
`;

export const exploreBestByTypeConnectionDocument = parse(EXPLORE_BEST_BY_TYPE_SOURCE) as TypedDocumentNode<any, any>;
