import { describe, expect, it } from 'vitest';

import { relatedClaimIds } from './use-claim-record';

describe('relatedClaimIds', () => {
  it('drops the source before counting its related claims', () => {
    const ids = relatedClaimIds('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'The source claim' },
    ]);

    expect(ids).toEqual([]);
    expect(ids).toHaveLength(0);
  });

  it('keeps named neighbours after the source in query order', () => {
    const ids = relatedClaimIds('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'First neighbour' },
      { id: 'cccccccccccccccccccccccccccccccc', name: null },
      { id: 'dddddddddddddddddddddddddddddddd', name: 'Second neighbour' },
    ]);

    expect(ids).toEqual(['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'dddddddddddddddddddddddddddddddd']);
  });
});
