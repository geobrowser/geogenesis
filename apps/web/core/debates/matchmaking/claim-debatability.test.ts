import { describe, expect, it } from 'vitest';

import { CLAIM_RESPONSE_FLOOR } from '~/core/claims/browse/claim-response-summary';

import { claimCountsKey, claimDebatability, orderByDebatability } from './claim-debatability';

const AGREE = true;
const DISAGREE = false;

describe('claimDebatability', () => {
  it('ranks holding out against a large majority above siding with it', () => {
    // 9 agree, 1 disagrees. The holder is the one who disagrees, or one of the nine.
    const counts = { positive: 9, negative: 1 };
    expect(claimDebatability(counts, DISAGREE)).toBeGreaterThan(claimDebatability(counts, AGREE));
  });

  it('ranks an even split above a lopsided one', () => {
    expect(claimDebatability({ positive: 5, negative: 5 }, AGREE)).toBeGreaterThan(
      claimDebatability({ positive: 9, negative: 1 }, AGREE)
    );
  });

  it('scores neither signal below the floor', () => {
    const below = CLAIM_RESPONSE_FLOOR - 1;
    expect(claimDebatability({ positive: 0, negative: below }, AGREE)).toBe(0);
    expect(claimDebatability({ positive: 1, negative: 1 }, AGREE)).toBe(0);
    expect(claimDebatability({ positive: 1, negative: CLAIM_RESPONSE_FLOOR - 1 }, AGREE)).toBeGreaterThan(0);
  });

  it('leaves the holder out of the crowd they are measured against', () => {
    // Alone against eleven: everyone else disagrees with them, which is as against as it gets.
    expect(claimDebatability({ positive: 1, negative: 11 }, AGREE)).toBe(1);
  });

  it('puts a lone holdout and an even split level, so both kinds reach the top', () => {
    expect(claimDebatability({ positive: 1, negative: 9 }, AGREE)).toBe(1);
    expect(claimDebatability({ positive: 5, negative: 5 }, AGREE)).toBe(1);
  });

  it('falls back to the split when the holder has no side, and to 0 without counts', () => {
    expect(claimDebatability({ positive: 5, negative: 5 }, null)).toBe(1);
    expect(claimDebatability(undefined, AGREE)).toBe(0);
  });
});

describe('orderByDebatability', () => {
  it('orders the ticket’s example: against the majority and even split first, lopsided agreement, then one vote', () => {
    const rows = [
      { id: 'single-vote', counts: { positive: 1, negative: 0 }, holder: AGREE },
      { id: 'lopsided-agree', counts: { positive: 9, negative: 1 }, holder: AGREE },
      { id: 'even-split', counts: { positive: 5, negative: 5 }, holder: AGREE },
      { id: 'lopsided-oppose', counts: { positive: 9, negative: 1 }, holder: DISAGREE },
    ];

    const ordered = orderByDebatability(rows, row => claimDebatability(row.counts, row.holder)).map(row => row.id);

    expect(ordered.slice(0, 2).sort()).toEqual(['even-split', 'lopsided-oppose']);
    expect(ordered.slice(2)).toEqual(['lopsided-agree', 'single-vote']);
  });

  it('puts pinned rows above every other, most debatable first among them', () => {
    const scores: Record<string, number> = { a: 0.2, b: 1, c: 0.5, d: 0.9 };
    const pinned = (row: string) => row === 'a' || row === 'c';
    expect(orderByDebatability(['a', 'b', 'c', 'd'], row => scores[row]!, pinned)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('keeps the incoming order among equal scores', () => {
    const rows = ['a', 'b', 'c', 'd'];
    expect(orderByDebatability(rows, () => 0)).toEqual(rows);
    expect(orderByDebatability(rows, row => (row === 'c' ? 1 : 0))).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('claimCountsKey', () => {
  it('files a claim the same whichever id spelling it arrives in', () => {
    expect(claimCountsKey('0CF25BDE-4D9C-423C-AD20-49880EF06D48', '52C7AE14-9838-B6D4-7CE0-F3B2A5974546')).toBe(
      claimCountsKey('0cf25bde4d9c423cad2049880ef06d48', '52c7ae149838b6d47ce0f3b2a5974546')
    );
  });
});
