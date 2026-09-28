import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { EntityFilter } from '~/core/gql/graphql';
import { normId } from '~/core/utils/norm-id';

/**
 * The two kinds of debate activity a space can hold.
 *
 * Named rather than passed around as type ids because every surface here reads the same pair —
 * the Overview card's two toggles, the two full-screen feeds, the two counts — and a bare
 * `typeIds: [x]` at four call sites is four chances to send Claim where Debate was meant.
 */
export type SpaceActivityKind = 'debates' | 'claims';

export const SPACE_ACTIVITY_KINDS: readonly SpaceActivityKind[] = ['debates', 'claims'];

/**
 * What each kind is called, on the card and on the row that leaves it.
 *
 * Together rather than as two records keyed alike, and here rather than in the component, because
 * three surfaces draw this card: a space's Overview, a person's profile and a claim page. The other
 * two still state these inline, which is what made "See all" on a space read differently from
 * "View all" everywhere else until it was caught.
 */
export const SPACE_ACTIVITY_LABELS: Record<SpaceActivityKind, { label: string; seeAllLabel: string }> = {
  debates: { label: 'Debates', seeAllLabel: 'View all debates' },
  claims: { label: 'Claims', seeAllLabel: 'View all claims' },
};

/** The entity type each kind selects. One type each — the two surfaces are never mixed. */
export const SPACE_ACTIVITY_TYPE_ID: Record<SpaceActivityKind, string> = {
  debates: DEBATE_TYPE_ID,
  claims: CLAIM_TYPE_ID,
};

/**
 * The full-screen view a "See all" row leads to — the space's own tab for that kind.
 *
 * Both are Best-ordered, which is what makes them the right end of a "See all" from a card that
 * ranks its six the same way. `/debates` is the full-bleed player feed, ranked by
 * `useDebatesBestOrder` — the same `entitiesRankedForFeedByType` ranking Explore's Best sort uses.
 * `/claims` is the space's claims tab, which this work turned into the matching browse feed.
 *
 * Deliberately the existing routes rather than a new `explore/` pair. An earlier revision added
 * `/space/<id>/explore/debates` and `/space/<id>/explore/claims`, which meant a second debates
 * surface beside the player people already reach from everywhere else — two views of one thing,
 * ranked alike and drifting apart from the first change to either.
 */
export function spaceActivityFeedHref(spaceId: string, kind: SpaceActivityKind): string {
  return `/space/${spaceId}/${kind}`;
}

/**
 * How many debates and (debate-tagged) claims a space holds.
 *
 * `null` for either means the count could not be read, which the card draws as a dash rather than
 * a confident zero — the same distinction `ProfileActivitySection` already makes for a person.
 */
/**
 * How many `Types -> Debate` relations one request reads before the distinct count below becomes a
 * lower bound. The whole graph held 88 when this was written, so it is not a page size so much as
 * the point past which {@link decodeSpaceDebateActivityCounts} stops trusting its own dedupe.
 */
const DEBATE_RELATION_WINDOW = 500;

export type SpaceDebateActivityCounts = {
  debates: number | null;
  claims: number | null;
};

export const NO_SPACE_DEBATE_ACTIVITY_COUNTS: SpaceDebateActivityCounts = { debates: null, claims: null };

/**
 * The counts, in one request.
 *
 * ## Why debates are counted through their TYPES relations
 *
 * The obvious query — `entitiesConnection(filter: { typeIds: { overlaps: [Debate] }, spaceIds: {
 * overlaps: [space] } }) { totalCount }` — **times out**. Measured against testnet on a space with
 * 29 debates it hit the 30s statement limit on three consecutive attempts, and so did the same
 * shape for Claim. Counting the `Types -> Debate` relations *written in this space* answers the
 * same question off an indexed relation walk: 0.35s for the same space.
 *
 * The catch is that relations are not distinct per entity — the same space held 32 relations across
 * 29 debates, one debate typed three times — which is the trap `fetch-profile-facts` documents for
 * the debate-side counts and solves the same way: take the nodes and count distinct sources. The
 * window is 500, which is comfortable: the whole graph held 88 `Types -> Debate` relations when
 * this was written, so a truncated read is not reachable today.
 *
 * If it ever is, the answer is that there isn't one. `totalCount` counts *relations*, and the
 * duplicates it counts are the entire reason this decoder deduplicates — so handing it back states
 * a number of the wrong noun, about the largest space, where the count matters most. A dash says
 * what is true, and it is the distinction this card already draws everywhere else: "—" for a count
 * that could not be read, never a confident figure nobody stands behind.
 *
 * ## Why claims are counted as entities
 *
 * Claims carry the same timeout problem *unless* the tag clause is present — and it always is, since
 * the feed beside this count only shows debate-tagged claims (GEO-2835). The tag narrows a corpus
 * of hundreds of thousands to a few hundred per space, and the entity count then returns in ~0.4s.
 * Counting entities also needs no dedupe pass, so the two halves of this query are shaped
 * differently on purpose rather than by oversight.
 *
 * The claims half takes the list's own filter as a variable rather than restating it. That is not
 * tidiness: a relation carries its own space independently of the entity's, so an unscoped tag
 * clause would accept a `Tags -> Debate` written from anywhere — the loophole
 * `claimsRequireDebateTagFilter` exists to close — and the pill and the list have to close it
 * identically or they are counting different corpora. Restated, they also drifted on the name
 * requirement: the rows demand one and the count did not, which agreed only because every tagged
 * claim happens to be named. One clause, passed in, cannot drift either way.
 */
const SPACE_DEBATE_ACTIVITY_COUNTS_SOURCE = /* GraphQL */ `
  query SpaceDebateActivityCounts(
    $typesPropertyId: UUID!
    $debateTypeId: UUID!
    $spaceIdList: [UUID!]
    $spaceIds: UUIDFilter!
    $claimTypeIds: UUIDFilter
    $claimsFilter: EntityFilter
  ) {
    debateTypeRelations: relationsConnection(
      first: ${DEBATE_RELATION_WINDOW}
      filter: { typeId: { is: $typesPropertyId }, toEntityId: { is: $debateTypeId }, spaceId: { in: $spaceIdList } }
    ) {
      totalCount
      nodes {
        fromEntityId
      }
    }
    taggedClaims: entitiesConnection(spaceIds: $spaceIds, typeIds: $claimTypeIds, filter: $claimsFilter) {
      totalCount
    }
  }
`;

export const spaceDebateActivityCountsDocument = parse(SPACE_DEBATE_ACTIVITY_COUNTS_SOURCE) as TypedDocumentNode<
  any,
  any
>;

export type SpaceDebateActivityCountsResult = {
  debateTypeRelations: {
    totalCount: number | null;
    nodes: ({ fromEntityId: string | null } | null)[] | null;
  } | null;
  taggedClaims: { totalCount: number | null } | null;
};

export function decodeSpaceDebateActivityCounts(data: SpaceDebateActivityCountsResult): SpaceDebateActivityCounts {
  const relations = data.debateTypeRelations;
  const nodes = relations?.nodes ?? null;
  const totalCount = relations?.totalCount ?? null;

  let debates: number | null = null;
  if (nodes) {
    const distinct = new Set<string>();
    for (const node of nodes) {
      if (node?.fromEntityId) distinct.add(normId(node.fromEntityId));
    }
    /*
     * A short window is exact; anything else is not.
     *
     * With a total to compare against, "short" is literal. Without one — the total failed to
     * decode, or the shape changed — a window that came back *full* is indistinguishable from a
     * truncated one: there is no evidence the relations stopped there rather than at the limit. A
     * partial window with no total is still exact, because nothing was cut off to reach it.
     */
    const truncated = totalCount != null ? nodes.length < totalCount : nodes.length >= DEBATE_RELATION_WINDOW;
    debates = truncated ? null : distinct.size;
  }

  return { debates, claims: data.taggedClaims?.totalCount ?? null };
}

/**
 * `claimsFilter` is passed in rather than built here, and it is the list's own — see
 * {@link spaceActivityRowsFilter}. Composed by the caller because the filter lives in the module
 * that reads the rows and that module needs the kinds from this one; wiring it at the one place
 * that imports both keeps the two files acyclic and keeps the count measuring what the list shows.
 */
export const spaceDebateActivityCountsVariables = (spaceId: string, claimsFilter: EntityFilter) => ({
  typesPropertyId: SystemIds.TYPES_PROPERTY,
  debateTypeId: DEBATE_TYPE_ID,
  spaceIdList: [spaceId],
  spaceIds: { in: [spaceId] },
  claimTypeIds: { in: [CLAIM_TYPE_ID] },
  claimsFilter,
});
