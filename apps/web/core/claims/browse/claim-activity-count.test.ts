import { describe, expect, it } from 'vitest';

import { decodeClaimActivityCounts } from './claim-activity-count';

function debate(comments: number, extracted: Array<number>) {
  return {
    fromEntity: {
      id: `debate${comments}${extracted.join('')}`,
      comments: { totalCount: comments },
      extracted: extracted.map((n, index) => ({
        fromEntity: { id: `extracted${index}`, comments: { totalCount: n } },
      })),
    },
  };
}

describe('decodeClaimActivityCounts', () => {
  it('adds up everything the feed shows by default', () => {
    const counts = decodeClaimActivityCounts({
      entities: [
        {
          id: 'claim1',
          comments: { totalCount: 3 },
          debates: [debate(2, [0, 1]), debate(0, [4])],
        },
      ],
    });

    // 3 claim comments + 2 debates + 3 extracted claims + (2 + 0) debate comments + (0 + 1 + 4)
    // comments on extracted claims.
    expect(counts.get('claim1')).toEqual({
      comments: 3,
      debates: 2,
      extractedClaims: 3,
      debateComments: 7,
      total: 15,
    });
  });

  it('keys by canonical id so a hyphenated lookup finds it', () => {
    const counts = decodeClaimActivityCounts({
      entities: [{ id: '3e4a0955-699a-4c8f-813f-cc803a3335ba', comments: { totalCount: 1 }, debates: [] }],
    });

    expect(counts.get('3e4a0955699a4c8f813fcc803a3335ba')?.total).toBe(1);
  });

  it('counts a claim nobody has touched as zero rather than leaving it out', () => {
    const counts = decodeClaimActivityCounts({ entities: [{ id: 'claim1', comments: { totalCount: 0 }, debates: [] }] });

    expect(counts.get('claim1')?.total).toBe(0);
  });

  // A debate with no transcript yet is still a debate — it counts, its absent claims do not.
  it('counts a debate that produced no claims', () => {
    const counts = decodeClaimActivityCounts({
      entities: [{ id: 'claim1', comments: { totalCount: 0 }, debates: [debate(0, [])] }],
    });

    expect(counts.get('claim1')).toMatchObject({ debates: 1, extractedClaims: 0, total: 1 });
  });

  it('survives nulls anywhere the API may return them', () => {
    const counts = decodeClaimActivityCounts({
      entities: [
        null,
        { id: null, comments: null, debates: null },
        {
          id: 'claim1',
          comments: null,
          debates: [null, { fromEntity: null }, { fromEntity: { id: 'd', comments: null, extracted: [null] } }],
        },
      ],
    });

    expect([...counts.keys()]).toEqual(['claim1']);
    expect(counts.get('claim1')).toMatchObject({ comments: 0, debates: 1, extractedClaims: 0, total: 1 });
  });

  it('is empty when nothing came back', () => {
    expect(decodeClaimActivityCounts({}).size).toBe(0);
    expect(decodeClaimActivityCounts({ entities: null }).size).toBe(0);
  });
});
