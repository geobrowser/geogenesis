import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import type { EntityFilter } from '~/core/gql/graphql';

/**
 * Explore's claims are the debatable ones (GEO-2835): a claim reaches the feed only if a curator
 * has tagged it `Debate`, and everything else reaches it exactly as before.
 *
 * Read as an OR of "is not a claim" and "carries the tag", which is what keeps this a restriction
 * on claims rather than on the feed. Written as one clause rather than as a claim-specific query
 * because Explore is a mixed feed — one page carries news stories, debates and claims together, and
 * the tag has nothing to say about the first two.
 *
 * Both halves match on ids rather than names. `Debate` is a tag entity and a type, and the display
 * name of either can be edited by anyone with rights to it; an id cannot.
 *
 * Note what this is *not* scoped by: neither half mentions a space, so a claim tagged in any space
 * passes. The alternative — the tag having to be in one of the spaces the feed is scoped to — is
 * what `tagged-claims` needs, because there the tag's space is what a card is built against. Here
 * the card is built against the entity's own display space and the tag is only a gate, so scoping
 * it would drop claims for the space they were curated in rather than the space they are read in.
 *
 * Measured before relying on it (testnet, 2026-09-08): 1,151 of 326,020 claims carry the tag, so
 * this removes almost every claim from the feed — which is the intent, and worth knowing.
 *
 * Cost, from paired interleaved A/B through the route — every request the Explore UI can actually
 * issue, ten to thirty pairs each, alternating which arm ran first:
 *
 *   Best (unwindowed)   357ms with, 355ms without
 *   New  (unwindowed)   285ms with, 325ms without
 *   Top  every window   within ±4%, no window worse than noise
 *
 * In each the gated arm was the slower one in about half the pairs, which is what a free clause
 * looks like. It is not free everywhere, though, and the exception is worth knowing about before
 * anyone widens the feed:
 *
 *   **This clause roughly doubles a query that also carries a `createdAt` window.** Best over the
 *   last year went 462ms -> 939ms and New over the last week 1985ms -> 3356ms, each slower in
 *   10 of 10 pairs with no overlap between the two arms' ranges. Nothing reaches that combination
 *   today: `SORTS_WITH_TIME_RANGE` in `entity-feed` is `['top']`, so Best and New leave the `time`
 *   param off entirely, and Top — the one sort that does send a window — is unaffected. Adding
 *   Best or New to that list without re-measuring would make the feed about twice as slow.
 */
export const CLAIMS_REQUIRE_DEBATE_TAG_FILTER = {
  or: [
    // Not a claim. The types *relation*, not the `typeIds` argument, because a filter can only
    // negate a relation — and this half has to be a negation, or the clause would silently exclude
    // every news story and debate too.
    { relations: { none: { typeId: { is: SystemIds.TYPES_PROPERTY }, toEntityId: { is: CLAIM_TYPE_ID } } } },
    // Or carries the tag. Same property and shape the claims tab filters on, so the two surfaces
    // agree about what "tagged for debate" means.
    { relations: { some: { typeId: { is: TAG_PROPERTY_ID }, toEntityId: { is: DEBATE_TAG_ID } } } },
  ],
} satisfies EntityFilter;
