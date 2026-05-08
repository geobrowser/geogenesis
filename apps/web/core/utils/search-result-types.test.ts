import { describe, expect, it } from 'vitest';

import { dedupeSearchResultTypeTags } from './search-result-types';

describe('dedupeSearchResultTypeTags', () => {
  it('deduplicates aggregated and per-space search result types', () => {
    const result = dedupeSearchResultTypeTags({
      id: 'entity-id',
      name: 'Entity',
      description: null,
      spaces: [],
      types: [
        { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: null },
        { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Person' },
        { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Organization' },
      ],
      typesBySpace: {
        space1: [
          { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: null },
          { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Person' },
        ],
      },
    });

    expect(result.types).toEqual([
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Person' },
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Organization' },
    ]);
    expect(result.typesBySpace).toEqual({
      space1: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Person' }],
    });
  });
});
