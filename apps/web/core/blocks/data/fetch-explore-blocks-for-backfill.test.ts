import { describe, expect, it } from 'vitest';

import { DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID } from './block-ontology-ids';
import { mapExploreViewRelationNode } from './fetch-explore-blocks-for-backfill';

describe('mapExploreViewRelationNode', () => {
  it('maps an Explore Blocks relation with no infinite-scroll triple', () => {
    expect(
      mapExploreViewRelationNode({
        spaceId: 'space-1',
        fromEntity: { id: 'rel-1', valuesList: [] },
      })
    ).toEqual({
      relationEntityId: 'rel-1',
      spaceId: 'space-1',
      view: 'EXPLORE',
      hasInfiniteScrollValue: false,
    });
  });

  it('treats a same-space infinite-scroll triple as present even when it is false', () => {
    expect(
      mapExploreViewRelationNode({
        spaceId: 'space-1',
        fromEntity: {
          id: 'rel-1',
          valuesList: [{ spaceId: 'space-1', propertyId: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID }],
        },
      })
    ).toEqual({
      relationEntityId: 'rel-1',
      spaceId: 'space-1',
      view: 'EXPLORE',
      hasInfiniteScrollValue: true,
    });
  });

  it('ignores infinite-scroll triples written in another space', () => {
    const mapped = mapExploreViewRelationNode({
      spaceId: 'space-1',
      fromEntity: {
        id: 'rel-1',
        valuesList: [{ spaceId: 'space-other', propertyId: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID }],
      },
    });

    // Asserted rather than `!`-ed: the node is complete, so a null here is the mapper regressing,
    // and that should fail on its own line instead of as a property access on null.
    expect(mapped).not.toBeNull();
    expect(mapped?.hasInfiniteScrollValue).toBe(false);
  });

  it('drops incomplete nodes', () => {
    expect(mapExploreViewRelationNode({ spaceId: null, fromEntity: { id: 'rel-1', valuesList: [] } })).toBeNull();
    expect(mapExploreViewRelationNode({ spaceId: 'space-1', fromEntity: null })).toBeNull();
  });
});
