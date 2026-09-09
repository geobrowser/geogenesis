import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';

import { claimsRequireDebateTagFilter } from './explore-debate-tag-filter';

const SPACES = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'];
const FILTER = claimsRequireDebateTagFilter(SPACES);

/**
 * The clause is evaluated by the server, so what a test here can pin is its *shape* — and the ways
 * that shape can be wrong are all silent. A `some` where the first branch has a `none` turns a
 * restriction on claims into one on the whole feed; a key other than `or` collides with the
 * exclusion clause it is spread alongside and drops that clause instead; and an unscoped tag half
 * turns a curation gate into an open one.
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

  it('admits a claim on the Debate tag, matched by id and scoped to the feed’s spaces', () => {
    // Ids, not names: `Debate` names both a tag entity and a type, and either display name can be
    // edited by anyone with rights to it.
    //
    // The `spaceId` is not decoration. Relations carry their own space, so without it the clause
    // accepts a tag written from any space at all — and anyone with a space of their own could put
    // an arbitrary claim in front of every reader (GEO-2835 review).
    expect(FILTER.or[1]).toEqual({
      relations: {
        some: {
          typeId: { is: TAG_PROPERTY_ID },
          toEntityId: { is: DEBATE_TAG_ID },
          spaceId: { in: SPACES },
        },
      },
    });
  });

  it('copies the space list rather than aliasing the caller’s array', () => {
    const spaces = ['cccccccccccccccccccccccccccccccc'];
    const filter = claimsRequireDebateTagFilter(spaces);
    spaces.push('dddddddddddddddddddddddddddddddd');

    // The feed builds this per request from `baseIds` and the clause outlives the call; sharing the
    // array would let a later mutation widen a filter that has already been reasoned about.
    expect((filter.or[1] as { relations: { some: { spaceId: { in: string[] } } } }).relations.some.spaceId.in).toEqual([
      'cccccccccccccccccccccccccccccccc',
    ]);
  });
});
