import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';

/**
 * The two kinds of debate activity a space can hold.
 *
 * Named rather than passed around as type ids because every surface here reads the same pair —
 * the Overview card's two toggles, the two full-screen feeds, the two counts — and a bare
 * `typeIds: [x]` at four call sites is four chances to send Claim where Debate was meant.
 */
export type SpaceActivityKind = 'debates' | 'claims';

export const SPACE_ACTIVITY_KINDS: readonly SpaceActivityKind[] = ['debates', 'claims'];

/** The entity type each kind selects. One type each, deliberately — see `spaceActivityFeedHref`. */
export const SPACE_ACTIVITY_TYPE_ID: Record<SpaceActivityKind, string> = {
  debates: DEBATE_TYPE_ID,
  claims: CLAIM_TYPE_ID,
};

/** Normalized so two spellings of one id are one type. Same rule the rest of the app compares by. */
function normalizeId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

/**
 * Which kind a `typeIds` parameter names, or `null` for anything else.
 *
 * The feed surfaces send `typeIds` because that is what every `EntityFeed` sends, and the endpoint
 * has to turn it back into one of exactly two answers. Anything else — two types, a type this
 * surface is not about, an empty list — is rejected rather than widened: a space-scoped Explore
 * reader for arbitrary types is a different endpoint from this one, and should be written as one.
 */
export function parseSpaceActivityKindFromTypeIds(raw: string | null): SpaceActivityKind | null {
  if (!raw) return null;
  const ids = raw.split(',').map(normalizeId).filter(Boolean);
  if (ids.length !== 1) return null;
  return SPACE_ACTIVITY_KINDS.find(kind => normalizeId(SPACE_ACTIVITY_TYPE_ID[kind]) === ids[0]) ?? null;
}

/**
 * The full-screen feed a "See all" row leads to.
 *
 * Under `explore/` rather than at `/space/<id>/debates` or `/space/<id>/claims`, both of which are
 * already taken and are not this: the first is the full-bleed video player (`SpaceChromeGate`
 * strips the space chrome from it), and the second is the editor surface for staging new claims.
 * This is the browsing view — the Explore feed, narrowed to one type in one space.
 */
export function spaceActivityFeedHref(spaceId: string, kind: SpaceActivityKind): string {
  return `/space/${spaceId}/explore/${kind}`;
}

/** The REST endpoint both the Overview card and the full-screen feeds read. */
export function spaceActivityFeedEndpoint(spaceId: string): string {
  return `/api/space/${spaceId}/debate-activity/feed`;
}

/**
 * How many debates and (debate-tagged) claims a space holds.
 *
 * `null` for either means the count could not be read, which the card draws as a dash rather than
 * a confident zero — the same distinction `ProfileActivitySection` already makes for a person.
 */
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
 * this was written. Past that the distinct count would be a lower bound over a partial window, so
 * a truncated read falls back to `totalCount` — an over-count of a few percent beats a number that
 * silently stops growing at 500.
 *
 * ## Why claims are counted as entities
 *
 * Claims carry the same timeout problem *unless* the tag clause is present — and it always is, since
 * the feed beside this count only shows debate-tagged claims (GEO-2835). The tag narrows a corpus
 * of hundreds of thousands to a few hundred per space, and the entity count then returns in ~0.4s.
 * Counting entities also needs no dedupe pass, so the two halves of this query are shaped
 * differently on purpose rather than by oversight.
 *
 * Both halves scope the *relation* to this space, not just the entity. A relation carries its own
 * space independently of the entity's, so an unscoped tag clause would accept a `Tags -> Debate`
 * written from anywhere — the loophole `claimsRequireDebateTagFilter` exists to close. The count
 * and the feed have to close it the same way or the pill and the list disagree.
 */
export const SPACE_DEBATE_ACTIVITY_COUNTS_QUERY = /* GraphQL */ `
  query SpaceDebateActivityCounts(
    $typesPropertyId: UUID!
    $debateTypeId: UUID!
    $claimTypeIds: [UUID!]
    $spaceIds: [UUID!]
    $tagPropertyId: UUID!
    $debateTagId: UUID!
  ) {
    debateTypeRelations: relationsConnection(
      first: 500
      filter: { typeId: { is: $typesPropertyId }, toEntityId: { is: $debateTypeId }, spaceId: { in: $spaceIds } }
    ) {
      totalCount
      nodes {
        fromEntityId
      }
    }
    taggedClaims: entitiesConnection(
      filter: {
        typeIds: { overlaps: $claimTypeIds }
        spaceIds: { overlaps: $spaceIds }
        relations: {
          some: { typeId: { is: $tagPropertyId }, toEntityId: { is: $debateTagId }, spaceId: { in: $spaceIds } }
        }
      }
    ) {
      totalCount
    }
  }
`;

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
      if (node?.fromEntityId) distinct.add(normalizeId(node.fromEntityId));
    }
    // A full window is exact; a truncated one is not, and `totalCount` is the honest answer there.
    debates = totalCount != null && nodes.length < totalCount ? totalCount : distinct.size;
  } else if (totalCount != null) {
    debates = totalCount;
  }

  return { debates, claims: data.taggedClaims?.totalCount ?? null };
}

export const spaceDebateActivityCountsVariables = (spaceId: string) => ({
  typesPropertyId: SystemIds.TYPES_PROPERTY,
  debateTypeId: DEBATE_TYPE_ID,
  claimTypeIds: [CLAIM_TYPE_ID],
  spaceIds: [spaceId],
  tagPropertyId: TAG_PROPERTY_ID,
  debateTagId: DEBATE_TAG_ID,
});
