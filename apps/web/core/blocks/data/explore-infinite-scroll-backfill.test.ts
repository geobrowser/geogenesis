import { describe, expect, it } from 'vitest';

import { DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID } from './block-ontology-ids';
import {
  type ExploreBlockRelation,
  buildExploreInfiniteScrollBackfillPlan,
  buildExploreInfiniteScrollBackfillValues,
} from './explore-infinite-scroll-backfill';

const relation = (overrides: Partial<ExploreBlockRelation> = {}): ExploreBlockRelation => ({
  relationEntityId: 'rel-1',
  spaceId: 'space-1',
  view: 'EXPLORE',
  hasInfiniteScrollValue: false,
  ...overrides,
});

describe('buildExploreInfiniteScrollBackfillPlan', () => {
  it('stamps an Explore block that carries no value', () => {
    const plan = buildExploreInfiniteScrollBackfillPlan([relation()]);

    expect(plan.bySpace).toEqual([
      {
        spaceId: 'space-1',
        items: [
          {
            relationEntityId: 'rel-1',
            spaceId: 'space-1',
            propertyId: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID,
            value: '1',
          },
        ],
      },
    ]);
  });

  it('leaves an explicit false alone', () => {
    // The case a render-time stamp gets wrong: `parseBlockInfiniteScroll` reads absent and "false"
    // alike, so planning off the parsed boolean would overwrite the owner's choice on every visit.
    const plan = buildExploreInfiniteScrollBackfillPlan([relation({ hasInfiniteScrollValue: true })]);

    expect(plan.bySpace).toEqual([]);
    expect(plan.skipped).toEqual([{ relationEntityId: 'rel-1', reason: 'already-set' }]);
  });

  it('leaves non-Explore views alone', () => {
    const plan = buildExploreInfiniteScrollBackfillPlan([relation({ view: 'TABLE' })]);

    expect(plan.bySpace).toEqual([]);
    expect(plan.skipped).toEqual([{ relationEntityId: 'rel-1', reason: 'not-explore' }]);
  });

  it('groups by space so each one publishes a single edit', () => {
    const plan = buildExploreInfiniteScrollBackfillPlan([
      relation({ relationEntityId: 'a', spaceId: 'space-1' }),
      relation({ relationEntityId: 'b', spaceId: 'space-2' }),
      relation({ relationEntityId: 'c', spaceId: 'space-1' }),
    ]);

    expect(plan.bySpace.map(entry => entry.spaceId)).toEqual(['space-1', 'space-2']);
    expect(plan.bySpace[0].items.map(item => item.relationEntityId)).toEqual(['a', 'c']);
  });

  it('skips rows missing an id or a space rather than planning a malformed write', () => {
    const plan = buildExploreInfiniteScrollBackfillPlan([
      relation({ relationEntityId: '' }),
      relation({ relationEntityId: 'b', spaceId: '' }),
    ]);

    expect(plan.bySpace).toEqual([]);
    expect(plan.skipped.map(entry => entry.reason)).toEqual(['incomplete', 'incomplete']);
  });

  it('builds local BOOLEAN values for prepareLocalDataForPublishing', () => {
    const values = buildExploreInfiniteScrollBackfillValues([
      {
        relationEntityId: 'rel-1',
        spaceId: 'space-1',
        propertyId: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID,
        value: '1',
      },
    ]);

    expect(values).toEqual([
      {
        id: expect.any(String),
        entity: { id: 'rel-1', name: null },
        property: { id: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID, name: 'Infinite scroll', dataType: 'BOOLEAN' },
        spaceId: 'space-1',
        value: '1',
        isLocal: true,
        hasBeenPublished: false,
      },
    ]);
    expect(values[0].id).toContain('rel-1');
    expect(values[0].id).toContain(DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID);
  });
});
