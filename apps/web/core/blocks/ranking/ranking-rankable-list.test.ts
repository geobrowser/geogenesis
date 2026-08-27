import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Row } from '~/core/types';

import { splitRankableEntityIds } from './ranking-rankable-list';

function row(entityId: string, name: string): Row {
  return {
    entityId,
    placeholder: false,
    columns: {
      [SystemIds.NAME_PROPERTY]: {
        name,
        slotId: SystemIds.NAME_PROPERTY,
        propertyId: SystemIds.NAME_PROPERTY,
        space: 'space-1',
      },
    },
  } as Row;
}

describe('splitRankableEntityIds', () => {
  it('lists globally ranked ids first, then unranked filter matches in row order', () => {
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

  it('treats dashed and undashed ids as the same entity', () => {
    const global = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
    const rows = [
      row('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alpha'),
      row('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'Bravo'),
    ];

    expect(splitRankableEntityIds(global, rows)).toEqual({
      rankedEntityIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      unrankedEntityIds: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
    });
  });

  it('dedupes repeated filter rows in the unranked section', () => {
    const rows = [row('a', 'Alpha'), row('a', 'Alpha duplicate'), row('b', 'Bravo')];

    expect(splitRankableEntityIds([], rows)).toEqual({
      rankedEntityIds: [],
      unrankedEntityIds: ['a', 'b'],
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
