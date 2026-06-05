import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Row } from '~/core/types';

import { buildRankableEntityOrder, splitRankableEntityIds } from './ranking-rankable-list';

function row(entityId: string, name: string): Row {
  return {
    entityId,
    placeholder: false,
    columns: {
      [SystemIds.NAME_PROPERTY]: { name, slotId: SystemIds.NAME_PROPERTY, space: 'space-1' },
    },
  } as Row;
}

describe('splitRankableEntityIds', () => {
  it('lists globally ranked ids first, then unranked filter matches by name', () => {
    const global = ['b', 'a'];
    const rows = [row('a', 'Alpha'), row('c', 'Charlie'), row('b', 'Bravo'), row('d', 'Delta')];

    expect(splitRankableEntityIds(global, rows)).toEqual({
      rankedEntityIds: ['b', 'a'],
      unrankedEntityIds: ['c', 'd'],
    });
  });

  it('dedupes global ids and filter rows', () => {
    const global = ['a', 'a', 'b'];
    const rows = [row('a', 'Alpha'), row('b', 'Bravo')];

    expect(splitRankableEntityIds(global, rows)).toEqual({
      rankedEntityIds: ['a', 'b'],
      unrankedEntityIds: [],
    });
  });

  it('skips placeholders', () => {
    const rows = [{ entityId: 'x', placeholder: true, columns: {} } as Row, row('y', 'Yankee')];

    expect(splitRankableEntityIds([], rows)).toEqual({
      rankedEntityIds: [],
      unrankedEntityIds: ['y'],
    });
  });
});

describe('buildRankableEntityOrder', () => {
  it('concatenates ranked and unranked sections', () => {
    const global = ['z'];
    const rows = [row('a', 'Alpha'), row('z', 'Zulu')];

    expect(buildRankableEntityOrder(global, rows)).toEqual(['z', 'a']);
  });
});
