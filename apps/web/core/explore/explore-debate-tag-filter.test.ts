import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';

import { CLAIMS_REQUIRE_DEBATE_TAG_FILTER as FILTER } from './explore-debate-tag-filter';

/**
 * The clause is evaluated by the server, so what a test here can pin is its *shape* — and the two
 * ways that shape can be wrong are both silent. A `some` where the first branch has a `none` turns
 * a restriction on claims into one on the whole feed; a key other than `or` collides with the
 * exclusion clause it is spread alongside and drops that clause instead.
 *
 * The behaviour itself was checked against testnet (2026-09-08): scoped to Claim the clause returns
 * 1,151 of 326,020, and scoped to Debate it returns 36 of 36 — every non-claim untouched.
 */
describe('the explore debate-tag clause', () => {
  it('is a single `or`, so spreading it cannot displace the feed filter it joins', () => {
    // `buildFeedFilter` composes by spreading. `FEED_EXCLUDED_RELATIONS_FILTER` is keyed on
    // `relations`, so a clause written as a bare `relations` — the obvious first attempt — would
    // replace the system-entity and block-type exclusions rather than narrow alongside them.
    expect(Object.keys(FILTER)).toEqual(['or']);
    expect(FILTER.or).toHaveLength(2);
  });

  it('lets everything that is not a claim through, rather than restricting the whole feed', () => {
    // The negation is the half that keeps this scoped. Explore is a mixed feed and the tag says
    // nothing about a news story or a debate; written as `some`, this branch would require every
    // row in the feed to carry a claim tag and empty it.
    expect(FILTER.or[0]).toEqual({
      relations: { none: { typeId: { is: SystemIds.TYPES_PROPERTY }, toEntityId: { is: CLAIM_TYPE_ID } } },
    });
  });

  it('admits a claim on the Debate tag, matched by id', () => {
    // Ids, not names: `Debate` names both a tag entity and a type, and either display name can be
    // edited by anyone with rights to it.
    expect(FILTER.or[1]).toEqual({
      relations: { some: { typeId: { is: TAG_PROPERTY_ID }, toEntityId: { is: DEBATE_TAG_ID } } },
    });
  });

  it('does not scope the tag to a space', () => {
    // Unlike the claims tab, where the tag's space is what a card is built against. Here the card
    // is built against the entity's display space and the tag is only a gate, so scoping it would
    // drop claims for the space they were curated in rather than the one they are read in.
    expect(JSON.stringify(FILTER)).not.toContain('spaceId');
  });
});
