import { describe, expect, it } from 'vitest';

import { decodeEntityCommentCounts } from './use-entity-comment-counts';

describe('decodeEntityCommentCounts', () => {
  it('keys counts by canonical id, so a hyphenated lookup still finds them', () => {
    const counts = decodeEntityCommentCounts({
      entities: [{ id: '3e4a0955-699a-4c8f-813f-cc803a3335ba', backlinks: { totalCount: 3 } }],
    });

    expect(counts.get('3e4a0955699a4c8f813fcc803a3335ba')).toBe(3);
  });

  it('reads an entity with no comments as zero rather than leaving it out', () => {
    const counts = decodeEntityCommentCounts({ entities: [{ id: 'aa', backlinks: { totalCount: 0 } }] });

    expect(counts.get('aa')).toBe(0);
  });

  // A missing aggregate is the server declining to count, not a claim that there are none — but a
  // row has to render something, and zero is what the button already shows while it waits.
  it('falls back to zero when the aggregate is absent', () => {
    const counts = decodeEntityCommentCounts({ entities: [{ id: 'aa', backlinks: null }, { id: 'bb' }] });

    expect(counts.get('aa')).toBe(0);
    expect(counts.get('bb')).toBe(0);
  });

  it('skips rows the API returned as null', () => {
    const counts = decodeEntityCommentCounts({ entities: [null, { id: null }, { id: 'aa', backlinks: { totalCount: 2 } }] });

    expect([...counts.keys()]).toEqual(['aa']);
  });

  it('is an empty map when nothing came back', () => {
    expect(decodeEntityCommentCounts({}).size).toBe(0);
    expect(decodeEntityCommentCounts({ entities: null }).size).toBe(0);
  });
});
