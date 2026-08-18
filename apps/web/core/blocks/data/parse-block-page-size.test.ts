import { describe, expect, it } from 'vitest';

import type { Value } from '~/core/types';

import { DEFAULT_DATA_BLOCK_PAGE_SIZE } from './block-ontology-ids';
import { parseBlockPageSize, readBlockPageSizeFromValues } from './parse-block-page-size';

const SPACE_ID = 'space-1';

function pageSizeValue(value: string): Value {
  return {
    id: 'value-1',
    entity: { id: 'block-rel-1', name: null },
    property: { id: 'fd8d9863342d4dcea8fd9687805a88a4', name: 'Page size', dataType: 'INTEGER' },
    value,
    spaceId: SPACE_ID,
    isDeleted: false,
    isLocal: false,
    hasBeenPublished: true,
  };
}

describe('parseBlockPageSize', () => {
  it('returns fallback for empty input', () => {
    expect(parseBlockPageSize(null)).toBe(DEFAULT_DATA_BLOCK_PAGE_SIZE);
    expect(parseBlockPageSize('')).toBe(DEFAULT_DATA_BLOCK_PAGE_SIZE);
    expect(parseBlockPageSize('abc')).toBe(DEFAULT_DATA_BLOCK_PAGE_SIZE);
  });

  it('parses and clamps valid integers', () => {
    expect(parseBlockPageSize('3')).toBe(3);
    expect(parseBlockPageSize('0')).toBe(1);
    expect(parseBlockPageSize('500')).toBe(100);
  });
});

describe('readBlockPageSizeFromValues', () => {
  it('reads page size from block relation values', () => {
    expect(readBlockPageSizeFromValues([pageSizeValue('3')], SPACE_ID)).toBe(3);
  });

  it('ignores deleted values and other spaces', () => {
    expect(
      readBlockPageSizeFromValues([{ ...pageSizeValue('3'), isDeleted: true }, pageSizeValue('5')], SPACE_ID)
    ).toBe(5);
    expect(readBlockPageSizeFromValues([{ ...pageSizeValue('3'), spaceId: 'other' }], SPACE_ID)).toBe(
      DEFAULT_DATA_BLOCK_PAGE_SIZE
    );
  });
});
