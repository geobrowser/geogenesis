import { describe, expect, it } from 'vitest';

import { claimRecordIds } from './use-claim-record';

describe('claimRecordIds', () => {
  it('drops the source before counting its related claims', () => {
    const ids = claimRecordIds('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'The source claim' },
    ]);

    expect(ids).toEqual(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);
    expect(ids.length - 1).toBe(0);
  });

  it('keeps named neighbours after the source in query order', () => {
    const ids = claimRecordIds('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'First neighbour' },
      { id: 'cccccccccccccccccccccccccccccccc', name: null },
      { id: 'dddddddddddddddddddddddddddddddd', name: 'Second neighbour' },
    ]);

    expect(ids).toEqual([
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'dddddddddddddddddddddddddddddddd',
    ]);
  });
});
