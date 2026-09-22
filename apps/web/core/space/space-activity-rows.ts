import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
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

const FRAGMENT = 'SpaceActivityRowsFragment';

/** Rows per request. Two pages fill a tall screen, and one is plenty for the Overview card. */
export const SPACE_ACTIVITY_PAGE_SIZE = 50;

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
 * longer disagree. The 346 claims with no score yet sort last rather than dropping out, which is
 * the whole of the gap: the ranked feed can only return what it has scored.
 *
 * `spaceIds` and `typeIds` are connection arguments rather than filter clauses, which is how every
 * other explore document scopes itself — see `exploreEntitiesConnectionDocument`, whose selection
 * this shares so the rows decode into the same cards.
 */
const SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query SpaceActivityRows(
    $first: Int!
    $after: Cursor
    $spaceIds: UUIDFilter!
    $typeIds: UUIDFilter
    $filter: EntityFilter
    $spaceIdsForLists: [UUID!]!
  ) {
    entitiesConnection(
      first: $first
      after: $after
      orderBy: [RANKING_SCORE_DESC]
      spaceIds: $spaceIds
      typeIds: $typeIds
      filter: $filter
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${exploreCardNodeFields(FRAGMENT)}
      }
    }
  }
`;

export const spaceActivityRowsDocument = parse(SOURCE) as TypedDocumentNode<any, any>;

export type SpaceActivityRowsPage = {
  rows: ExploreFeedRow[];
  endCursor: string | null;
  hasNextPage: boolean;
};

type SpaceActivityRowsResponse = {
  entitiesConnection?: {
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
    nodes?: unknown[] | null;
  } | null;
};

/**
 * What a row has to carry to be worth drawing, beyond being the right type in the right space.
 *
 * A name, in this space — an entity with none renders as "Untitled", and the explore feed requires
 * the same thing for the same reason. And, for claims only, the `Debate` tag (GEO-2835): these
 * surfaces are about debate activity, and an untagged claim is not part of it. The tag relation is
 * scoped to this space as well as the entity, matching `claimsRequireDebateTagFilter` — a relation
 * carries its own space, so an unscoped clause would accept a tag applied from anywhere.
 *
 * Exported because the counts beside these lists have to be measured through the same gate, or the
 * number on the pill and the list it leads to are two different corpora.
 */
export function spaceActivityRowsFilter(spaceId: string, kind: SpaceActivityKind): EntityFilter {
  return {
    values: {
      some: {
        spaceId: { in: [spaceId] },
        propertyId: { is: EXPLORE_ENTITY_NAME_PROPERTY_ID },
        text: { isNull: false, isNot: '' },
      },
    },
    ...(kind === 'claims'
      ? {
          relations: {
            some: {
              typeId: { is: TAG_PROPERTY_ID },
              toEntityId: { is: DEBATE_TAG_ID },
              spaceId: { in: [spaceId] },
            },
          },
        }
      : {}),
  };
}

export function spaceActivityRowsVariables(args: {
  spaceId: string;
  kind: SpaceActivityKind;
  first: number;
  after: string | null;
}) {
  return {
    first: args.first,
    after: args.after,
    spaceIds: { in: [args.spaceId] },
    typeIds: { in: [SPACE_ACTIVITY_TYPE_ID[args.kind]] },
    filter: spaceActivityRowsFilter(args.spaceId, args.kind),
    spaceIdsForLists: [args.spaceId],
  };
}

/**
 * One page of rows, in the order the connection returned them.
 *
 * The allowed-space set is this space alone, which is what makes a card render *this* space's name,
 * values and types — a claim carried in three spaces would otherwise resolve against whichever the
 * entity happened to list first. No membership context, so the cards draw with their Join button
 * hidden rather than in a state this query cannot determine.
 */
export function decodeSpaceActivityRows(spaceId: string, response: SpaceActivityRowsResponse): SpaceActivityRowsPage {
  const connection = response.entitiesConnection;
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
