import { describe, expect, it } from 'vitest';

import type { Value } from '~/core/types';

import { parseBlockInfiniteScroll, readBlockInfiniteScrollFromValues } from './parse-block-infinite-scroll';

const SPACE_ID = 'space-1';

function infiniteScrollValue(value: string): Value {
  return {
    id: 'value-1',
    entity: { id: 'block-rel-1', name: null },
    property: { id: '456d585279fd4915aca820ff0a97b389', name: 'Infinite scroll', dataType: 'BOOLEAN' },
    value,
    spaceId: SPACE_ID,
    isDeleted: false,
    isLocal: false,
    hasBeenPublished: true,
  };
}

describe('parseBlockInfiniteScroll', () => {
  it('returns false for empty input', () => {
    expect(parseBlockInfiniteScroll(null)).toBe(false);
    expect(parseBlockInfiniteScroll('')).toBe(false);
    expect(parseBlockInfiniteScroll('0')).toBe(false);
    expect(parseBlockInfiniteScroll('no')).toBe(false);
  });

  it('parses truthy boolean encodings', () => {
    expect(parseBlockInfiniteScroll('1')).toBe(true);
    expect(parseBlockInfiniteScroll('true')).toBe(true);
    expect(parseBlockInfiniteScroll('TRUE')).toBe(true);
    expect(parseBlockInfiniteScroll('yes')).toBe(true);
  });
});

describe('readBlockInfiniteScrollFromValues', () => {
  it('reads infinite scroll from block relation values', () => {
    expect(readBlockInfiniteScrollFromValues([infiniteScrollValue('1')], SPACE_ID)).toBe(true);
    expect(readBlockInfiniteScrollFromValues([infiniteScrollValue('0')], SPACE_ID)).toBe(false);
  });

  it('ignores deleted values and other spaces', () => {
    expect(
      readBlockInfiniteScrollFromValues(
        [{ ...infiniteScrollValue('1'), isDeleted: true }, infiniteScrollValue('0')],
        SPACE_ID
      )
    ).toBe(false);
    expect(readBlockInfiniteScrollFromValues([{ ...infiniteScrollValue('1'), spaceId: 'other' }], SPACE_ID)).toBe(
      false
    );
  });
});
