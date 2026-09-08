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
 * this removes almost every claim from the feed — which is the intent, and worth knowing. On all
 * three sorts the clause is free or better: New 0.31s with against 0.49s without, Top 0.37s against
 * 0.29s, Best 0.42s against 0.38s, warm.
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
