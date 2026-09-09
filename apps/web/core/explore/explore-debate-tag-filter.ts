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
 * The tag half is scoped to the spaces the feed is already reading from, and that scoping is the
 * whole difference between a curation gate and an open one (GEO-2835 review). Relations carry
 * their own space, independent of the entity's, so an unscoped clause accepts a `Tags -> Debate`
 * relation written from *anywhere* — including a personal space nobody else reads. Anyone able to
 * write to a space of their own could therefore put an arbitrary claim in front of every reader,
 * provided it already lived in a space they browse. Scoping to the feed's own spaces closes that,
 * and it costs very little: of 1,311 tag relations on testnet (2026-09-08), zero were applied from
 * a space the tagged claim does not itself live in, so nothing curated today depends on the
 * loophole. Measured against the eleven spaces that hold tagged claims, scoping admits the same
 * 1,308 claims the unscoped clause did — no loss at all for a reader who browses the spaces doing
 * the curating. It does bite a reader narrowed to fewer: a three-space subset loses 4 of 304 and a
 * single space 5 of 352, around 1.4%, each a claim living in the space they picked but tagged in
 * one of the others. That is the price, and it buys the paragraph above.
 *
 * It also settles a disagreement this was supposed to end. `taggedEntityFilter` in
 * `core/debates/tagged-claims` puts `spaceId` on the tag relation too, so an unscoped clause here
 * meant a claim could pass Explore's gate and still never appear in the claims tab.
 *
 * Measured before relying on it (testnet, 2026-09-08): 1,151 of 326,020 claims carry the tag, so
 * this removes almost every claim from the feed — which is the intent, and worth knowing.
 *
 * Cost, from paired interleaved A/B through the route — every request the Explore UI can actually
 * issue, ten to thirty pairs each, alternating which arm ran first:
 *
 *   Best (unwindowed)   355ms with, 376ms without — slower in 12 of 30 pairs
 *   New  (unwindowed)   366ms with, 367ms without — slower in 15 of 30 pairs
 *   Top  every window   within ±9%, none worse than a coin flip
 *
 * Fifteen of thirty is exactly a coin flip, which is what a free clause looks like. Ten pairs is
 * not enough to see that: the same two rows first measured at +15.6% and +29.4%, and both went to
 * nothing at thirty. Re-measure with enough pairs before believing a delta here.
 *
 * It is not free everywhere, though, and the exception is worth knowing about before anyone widens
 * the feed:
 *
 *   **This clause roughly doubles a query that also carries a `createdAt` window.** Best over the
 *   last year went 462ms -> 939ms and New over the last week 1985ms -> 3356ms, each slower in
 *   10 of 10 pairs with no overlap between the two arms' ranges. Nothing reaches that combination
 *   today: `SORTS_WITH_TIME_RANGE` in `entity-feed` is `['top']`, so Best and New leave the `time`
 *   param off entirely, and Top — the one sort that does send a window — is unaffected. Adding
 *   Best or New to that list without re-measuring would make the feed about twice as slow.
 */
export function claimsRequireDebateTagFilter(spaceIds: readonly string[]) {
  return {
    or: [
      // Not a claim. The types *relation*, not the `typeIds` argument, because a filter can only
      // negate a relation — and this half has to be a negation, or the clause would silently
      // exclude every news story and debate too.
      { relations: { none: { typeId: { is: SystemIds.TYPES_PROPERTY }, toEntityId: { is: CLAIM_TYPE_ID } } } },
      // Or carries the tag, applied from one of the spaces this feed is already scoped to. Same
      // property, target and space-scoping the claims tab filters on, so the two surfaces agree
      // about what "tagged for debate" means.
      {
        relations: {
          some: {
            typeId: { is: TAG_PROPERTY_ID },
            toEntityId: { is: DEBATE_TAG_ID },
            spaceId: { in: [...spaceIds] },
          },
        },
      },
    ],
  } satisfies EntityFilter;
}
