import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { decodeRelationFacet, relationFacetByFilterDocument } from './relation-facet';

describe('relationFacetByFilterDocument', () => {
  it('accepts a complete relation filter so union populations can be grouped exactly', () => {
    const source = print(relationFacetByFilterDocument);

    expect(source).toContain('$filter: RelationFilter!');
    expect(source).toContain('relationsConnection(filter: $filter)');
    expect(source).toContain('groupedAggregates(groupBy: $groupBy)');
    expect(source).toContain('distinctCount');
    expect(source).toContain('fromEntityId');
  });
});

describe('decodeRelationFacet', () => {
  it('normalizes dashed group keys to the dashless spelling and coerces bigint-string counts', () => {
    const counts = decodeRelationFacet({
      relationsConnection: {
        groupedAggregates: [{ keys: ['5D050707-BC58-4011-9B1E-81AD3ADB6244'], distinctCount: { fromEntityId: '12' } }],
      },
    });
    expect(counts).toEqual([{ id: '5d050707bc5840119b1e81ad3adb6244', count: 12 }]);
  });

  it('preserves server order — ordering is the caller menu’s decision, not a wire fact', () => {
    const counts = decodeRelationFacet({
      relationsConnection: {
        groupedAggregates: [
          { keys: ['b'], distinctCount: { fromEntityId: '1' } },
          { keys: ['a'], distinctCount: { fromEntityId: '9' } },
        ],
      },
    });
    expect(counts.map(c => c.id)).toEqual(['b', 'a']);
  });

  it('skips null groups and keyless groups, and defaults a missing count to 0', () => {
    const counts = decodeRelationFacet({
      relationsConnection: {
        groupedAggregates: [
          null,
          { keys: null, distinctCount: { fromEntityId: '5' } },
          { keys: [], distinctCount: { fromEntityId: '5' } },
          { keys: ['a'], distinctCount: null },
          { keys: ['b'], distinctCount: { fromEntityId: null } },
        ],
      },
    });
    expect(counts).toEqual([
      { id: 'a', count: 0 },
      { id: 'b', count: 0 },
    ]);
  });

  it('handles a null connection or group list', () => {
    expect(decodeRelationFacet({ relationsConnection: null })).toEqual([]);
    expect(decodeRelationFacet({ relationsConnection: { groupedAggregates: null } })).toEqual([]);
  });
});
