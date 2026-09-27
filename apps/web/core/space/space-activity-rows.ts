import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import { type TaggedClaimFilters, taggedEntityFilter } from '~/core/debates/tagged-claims';
import {
  type ExploreCardEntity,
  type ExploreFeedRow,
  buildExploreFeedRows,
  decodeExploreCardEntity,
} from '~/core/explore/explore-card-item';
import { exploreCardNodeFields, exploreCardPropertyFragment } from '~/core/explore/explore-card-selection';
import { EXPLORE_ENTITY_NAME_PROPERTY_ID } from '~/core/explore/explore-constants';
import type { EntityFilter } from '~/core/gql/graphql';
import { normId } from '~/core/utils/norm-id';

import { SPACE_ACTIVITY_TYPE_ID, type SpaceActivityKind } from './space-debate-activity';

const RANKED_FRAGMENT = 'SpaceActivityRankedFragment';
const SCORED_FRAGMENT = 'SpaceActivityScoredFragment';

/** Rows per request. Two pages fill a tall screen, and one is plenty for the Overview card. */
export const SPACE_ACTIVITY_PAGE_SIZE = 50;

/**
 * The orders a space's activity list can be read in — Explore's own three, so a reader arriving
 * from that dropdown finds the one they already know.
 *
 * `best` and `new` are two orderings of one connection. `top` is a different connection entirely:
 * it ranks by the integer `Score` property, which `entitiesConnection` cannot order on, so it goes
 * through `entitiesOrderedByPropertyConnection` exactly as Explore's Top does. Everything else
 * about the request — the space, the type, the filter, the card selection — is identical, which is
 * why the two documents share a decoder.
 */
export type SpaceActivitySort = 'best' | 'new' | 'top';

export const SPACE_ACTIVITY_SORTS: readonly SpaceActivitySort[] = ['best', 'new', 'top'];

export const SPACE_ACTIVITY_SORT_LABEL: Record<SpaceActivitySort, string> = {
  best: 'Best',
  new: 'New',
  top: 'Top',
};

/** Which `orderBy` each ranked sort sends. `top` is not here: it is the other connection. */
const RANKED_ORDER_BY: Record<'best' | 'new', string[]> = {
  best: ['RANKING_SCORE_DESC'],
  new: ['CREATED_AT_DESC'],
};

/**
 * A space's debates or claims, ranked, straight off `entitiesConnection`.
 *
 * `orderBy: [RANKING_SCORE_DESC]` is the score Explore's "Best" sorts by, so this asks the index
 * for the ordering directly rather than going through the ranked-feed connection and its
 * candidate-window machinery. The difference is not academic — measured against the AI space:
 *
 *     ranked-feed connection   262 claims reachable, in 22/8-row pages
 *     this                     611 claims, 13 pages of 50, no duplicates, 9.4s to exhaust
 *
 * 611 is also exactly what the count beside it reports, so the pill and the list it leads to can no
 * longer disagree. The claims with no score yet sort last rather than dropping out, which is the
 * whole of the gap: the ranked feed can only return what it has scored.
 *
 * `spaceIds` and `typeIds` are connection arguments rather than filter clauses, which is how every
 * other explore document scopes itself — see `exploreEntitiesConnectionDocument`, whose selection
 * this shares so the rows decode into the same cards.
 */
const RANKED_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(RANKED_FRAGMENT)}

  query SpaceActivityRows(
    $first: Int!
    $after: Cursor
    $orderBy: [EntitiesOrderBy!]
    $spaceIds: UUIDFilter!
    $typeIds: UUIDFilter
    $filter: EntityFilter
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesConnection(
      first: $first
      after: $after
      orderBy: $orderBy
      spaceIds: $spaceIds
      typeIds: $typeIds
      filter: $filter
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${exploreCardNodeFields(RANKED_FRAGMENT)}
      }
    }
  }
`;

/**
 * The same list ordered by the integer `Score` property — Explore's "Top".
 *
 * A separate document because it is a separate connection: `entitiesConnection` has no `orderBy`
 * for a value held in a property rather than a column. `includeWithoutValue` unions in the entities
 * that match the space and type but have no score row yet, so Top ranks the whole set rather than
 * only the part of it that has been scored — the same argument Explore's Top sends, for the same
 * reason the ranked sort above keeps its unscored rows.
 */
const SCORED_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(SCORED_FRAGMENT)}

  query SpaceActivityRowsByScore(
    $first: Int!
    $after: Cursor
    $filter: EntityFilter
    $propertyId: UUID!
    $dataType: String!
    $sortDirection: SortOrder!
    $spaceIds: [UUID!]!
    $typeIds: [UUID!]
    $spaceIdsForLists: [UUID!]!
    $includeWithoutValue: Boolean
  ) {
    entitiesOrderedByPropertyConnection(
      first: $first
      after: $after
      filter: $filter
      propertyId: $propertyId
      dataType: $dataType
      sortDirection: $sortDirection
      spaceIds: $spaceIds
      typeIds: $typeIds
      includeWithoutValue: $includeWithoutValue
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${exploreCardNodeFields(SCORED_FRAGMENT)}
      }
    }
  }
`;

export const spaceActivityRowsDocument = parse(RANKED_SOURCE) as TypedDocumentNode<any, any>;
export const spaceActivityRowsByScoreDocument = parse(SCORED_SOURCE) as TypedDocumentNode<any, any>;

/** Which document a sort reads from. */
export function spaceActivityRowsDocumentFor(sort: SpaceActivitySort) {
  return sort === 'top' ? spaceActivityRowsByScoreDocument : spaceActivityRowsDocument;
}

export type SpaceActivityRowsPage = {
  rows: ExploreFeedRow[];
  endCursor: string | null;
  hasNextPage: boolean;
};

type Connection = {
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  nodes?: unknown[] | null;
};

export type SpaceActivityRowsResponse = {
  entitiesConnection?: Connection | null;
  entitiesOrderedByPropertyConnection?: Connection | null;
};

/** What narrows a claims list beyond its space and type. Debates take none of it. */
export type SpaceActivityFilters = {
  /** AND, not OR: a claim has to carry every picked topic. Matches the tagged-claims rule. */
  topicIds: string[];
  /**
   * The debounced text, carried for the *facet* rather than for the rows.
   *
   * The rows are narrowed by {@link searchClaimIds} — resolved text, see below. The topic menu
   * beside them resolves its own through `useTaggedTopicFacet`, which reads `TaggedClaimFilters.
   * search`, so leaving this empty counted the menu over every tagged claim in the space while the
   * list showed a search's worth. The menu could then offer a topic whose intersection with the
   * matches was empty — the one thing a co-occurrence menu promises it will not do.
   *
   * Both resolutions go through one react-query entry, keyed on tag and text, so naming it twice
   * costs no second request.
   */
  search: string;
  /**
   * The claims a text search matched, or `null` when nothing is being searched for.
   *
   * `null` and `[]` are opposite answers and only one of them narrows: nothing asked leaves the
   * list alone, nothing matched empties it.
   */
  searchClaimIds: string[] | null;
  /**
   * The ids are still being read.
   *
   * Only the topic facet reads this — it must not count a partial id set, because it would re-key
   * and re-fire on every page of one. The rows never see a partial set at all (the search hook
   * withholds it), so nothing about them depends on this.
   */
  isSearchPending?: boolean;
  /**
   * The search could not be resolved.
   *
   * Only the topic facet reads this, and for the same reason as the flag above: it counts against
   * the ids a search produced, so a search that produced none has nothing for it to count. Without
   * it the facet stays enabled, its own inner query stays disabled behind the failed search, and a
   * disabled query reports pending — so the menu announced counts that were never coming.
   */
  searchError?: unknown;
};

export const NO_SPACE_ACTIVITY_FILTERS: SpaceActivityFilters = { topicIds: [], search: '', searchClaimIds: null };

/**
 * The filters a claims list applies, in the shape the tagged-claims machinery already speaks.
 *
 * Both space fields name this one space: `spaceIds` is what the viewer picked (here, always this
 * space) and `eligibleSpaceIds` is what they may see at all. Neither is a choice on this surface —
 * a space's claims feed is about one space — so they agree, and `taggedEntityFilter` scopes the tag
 * relation to it either way.
 */
export function spaceTaggedClaimFilters(spaceId: string, filters: SpaceActivityFilters): TaggedClaimFilters {
  return {
    // The text never reaches the graph *filter* — `taggedEntityFilter` reads the resolved ids, not
    // this. It is what `useTaggedTopicFacet` resolves its own ids from, so the menu counts the
    // searched set rather than the whole space.
    search: filters.search,
    topicIds: filters.topicIds,
    spaceIds: [spaceId],
    eligibleSpaceIds: [spaceId],
    // Topics are per-space, and this surface is one space. Without this the menu offered — and the
    // list matched on — a topic assigned only somewhere else. See `TaggedClaimFilters`.
    topicSpaceIds: [spaceId],
  };
}

/**
 * What a row has to carry to be worth drawing, beyond being the right type in the right space.
 *
 * A name, in this space — an entity with none renders as "Untitled", and the explore feed requires
 * the same thing for the same reason.
 *
 * Claims carry more: the `Debate` tag (GEO-2835), the picked topics, and the ids a search matched.
 * All three come from `taggedEntityFilter`, the same clause `useTaggedTopicFacet` counts the topic
 * menu through — a second hand-written copy would be a list and a menu that disagree about what is
 * in it, and the counts beside the list are measured through it too.
 */
export function spaceActivityRowsFilter(
  spaceId: string,
  kind: SpaceActivityKind,
  filters: SpaceActivityFilters = NO_SPACE_ACTIVITY_FILTERS
): EntityFilter {
  const requireName = {
    values: {
      some: {
        spaceId: { in: [spaceId] },
        propertyId: { is: EXPLORE_ENTITY_NAME_PROPERTY_ID },
        text: { isNull: false, isNot: '' },
      },
    },
  };

  if (kind !== 'claims') return requireName;

  return {
    ...requireName,
    ...taggedEntityFilter(DEBATE_TAG_ID, spaceTaggedClaimFilters(spaceId, filters), filters.searchClaimIds),
  } as EntityFilter;
}

export function spaceActivityRowsVariables(args: {
  spaceId: string;
  kind: SpaceActivityKind;
  sort: SpaceActivitySort;
  first: number;
  after: string | null;
  filters?: SpaceActivityFilters;
}) {
  const filter = spaceActivityRowsFilter(args.spaceId, args.kind, args.filters);
  const typeId = SPACE_ACTIVITY_TYPE_ID[args.kind];
  const shared = { first: args.first, after: args.after, filter, spaceIdsForLists: [args.spaceId] };

  if (args.sort === 'top') {
    return {
      ...shared,
      propertyId: SCORE_SYSTEM_PROPERTY,
      dataType: 'integer',
      sortDirection: 'DESC',
      spaceIds: [args.spaceId],
      typeIds: [typeId],
      includeWithoutValue: true,
    };
  }

  return {
    ...shared,
    orderBy: RANKED_ORDER_BY[args.sort],
    spaceIds: { in: [args.spaceId] },
    typeIds: { in: [typeId] },
  };
}

/**
 * One page of rows, in the order the connection returned them.
 *
 * The allowed-space set is this space alone, which is what makes a card render *this* space's name,
 * values and types — a claim carried in three spaces would otherwise resolve against whichever the
 * entity happened to list first. No membership context, so the cards draw with their Join button
 * hidden rather than in a state this query cannot determine.
 *
 * Either connection, because the two sorts differ only in which one answered.
 */
export function decodeSpaceActivityRows(spaceId: string, response: SpaceActivityRowsResponse): SpaceActivityRowsPage {
  const connection = response.entitiesConnection ?? response.entitiesOrderedByPropertyConnection;
  const entities: ExploreCardEntity[] = [];

  for (const node of connection?.nodes ?? []) {
    const decoded = decodeExploreCardEntity(node);
    if (decoded) entities.push(decoded);
  }

  return {
    rows: buildExploreFeedRows(entities, new Set([normId(spaceId)]), new Set()),
    endCursor: connection?.pageInfo?.endCursor ?? null,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
  };
}
