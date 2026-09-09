import { describe, expect, it } from 'vitest';

import { EXPLORE_ENTITY_TYPE_IDS } from './explore-constants';
import { buildFeedFilter } from './fetch-explore-feed';

const SPACES = ['41e851610e13a19441c4d980f2f2ce6b'];

/**
 * The block/system exclusion is a `relations: { none: { or: [...] } }` clause — NOT EXISTS
 * over a disjunction, which is the shape a planner handles worst. It only earns that where
 * nothing narrower already constrains what comes back.
 */
describe('buildFeedFilter block/system exclusion', () => {
  it('is dropped when a type whitelist already says what to include', () => {
    const filter = buildFeedFilter({ spaceIds: SPACES, time: 'all', typeIds: EXPLORE_ENTITY_TYPE_IDS });

    // Every Explore type is a concrete content type, so a block or a system-managed row
    // cannot match one. Measured on testnet: over 400 entities under this whitelist the
    // exclusion removed none of them.
    expect(filter.relations).toBeUndefined();
  });

  it('is kept when there is no type whitelist, which is how Activity queries', () => {
    const filter = buildFeedFilter({ spaceIds: SPACES, time: 'all' });

    // Activity passes `typeIds: undefined` on purpose. Without this clause the same page
    // carries blocks and system rows — 74 of 400 on testnet, 49 of them blocks.
    expect(filter.relations).toBeDefined();
    expect(filter.relations?.none?.or).toHaveLength(2);
  });

  it('treats an empty type list as no whitelist rather than as a whitelist of nothing', () => {
    expect(buildFeedFilter({ spaceIds: SPACES, time: 'all', typeIds: [] }).relations).toBeDefined();
  });

  it('leaves the other clauses alone either way', () => {
    const withTypes = buildFeedFilter({ spaceIds: SPACES, time: 'week', typeIds: EXPLORE_ENTITY_TYPE_IDS });
    const withoutTypes = buildFeedFilter({ spaceIds: SPACES, time: 'week' });

    // The name requirement and the recency window are independent of the exclusion.
    for (const filter of [withTypes, withoutTypes]) {
      expect(filter.values?.some?.propertyId).toBeDefined();
      expect(filter.createdAt?.greaterThanOrEqualTo).toBeDefined();
    }
  });

  it('still scopes by type in the filter when the caller asks for entity scope', () => {
    const filter = buildFeedFilter({
      spaceIds: SPACES,
      time: 'all',
      typeIds: EXPLORE_ENTITY_TYPE_IDS,
      includeEntityScopeInFilter: true,
    });

    // Dropping the exclusion must not drop the whitelist it relies on being there.
    expect(filter.typeIds?.overlaps).toEqual([...EXPLORE_ENTITY_TYPE_IDS]);
    expect(filter.relations).toBeUndefined();
  });
});
