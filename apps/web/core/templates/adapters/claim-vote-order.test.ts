import { describe, expect, it } from 'vitest';

import { applyFrozenClaimOrder, claimOrderKey, freezeClaimOrder, orderClaimsByVotes } from './claim-vote-order';

const hex = (n: number) => n.toString(16).padStart(32, '0');
const seed = (n: number) => ({ id: hex(n), title: `Claim ${n}` });
const titles = (seeds: { title: string }[]) => seeds.map(s => s.title);

function totals(byClaim: Record<number, number>) {
  const map = new Map(Object.entries(byClaim).map(([n, votes]) => [hex(Number(n)), votes]));
  return (claimHex: string) => map.get(claimHex) ?? 0;
}

describe('orderClaimsByVotes', () => {
  it('puts the claims with the most votes first, and the claims with none after them in Best order', () => {
    const seeds = [1, 2, 3, 4, 5].map(seed);
    const ordered = orderClaimsByVotes({
      seeds,
      leadingCount: 0,
      voteTotalFor: totals({ 2: 3, 4: 12, 5: 1 }),
    });
    expect(titles(ordered)).toEqual(['Claim 4', 'Claim 2', 'Claim 5', 'Claim 1', 'Claim 3']);
  });

  it('breaks a tie in votes by Best order', () => {
    const seeds = [1, 2, 3, 4].map(seed);
    const ordered = orderClaimsByVotes({ seeds, leadingCount: 0, voteTotalFor: totals({ 1: 2, 3: 5, 4: 5, 2: 2 }) });
    expect(titles(ordered)).toEqual(['Claim 3', 'Claim 4', 'Claim 1', 'Claim 2']);
  });

  it('orders the agenda claims among themselves and keeps them ahead of the rest (GEO-3873)', () => {
    // Claims 1-2 are agenda claims; claim 3 has more votes than either but stays below them.
    const seeds = [1, 2, 3, 4, 5].map(seed);
    const ordered = orderClaimsByVotes({
      seeds,
      leadingCount: 2,
      voteTotalFor: totals({ 1: 1, 2: 4, 3: 50, 5: 9 }),
    });
    expect(titles(ordered)).toEqual(['Claim 2', 'Claim 1', 'Claim 3', 'Claim 5', 'Claim 4']);
  });

  it('matches ids written with or without dashes', () => {
    const dashed = { id: '00000000-0000-0000-0000-000000000002', title: 'Dashed' };
    const ordered = orderClaimsByVotes({ seeds: [seed(1), dashed], leadingCount: 0, voteTotalFor: totals({ 2: 1 }) });
    expect(titles(ordered)).toEqual(['Dashed', 'Claim 1']);
  });
});

describe('frozen claim order', () => {
  it('keys a set of claims the same in any order, and apart from another set or group size', () => {
    expect(claimOrderKey([seed(1), seed(2)], 1)).toBe(claimOrderKey([seed(2), seed(1)], 1));
    expect(claimOrderKey([seed(1), seed(2)], 1)).not.toBe(claimOrderKey([seed(1), seed(3)], 1));
    expect(claimOrderKey([seed(1), seed(2)], 1)).not.toBe(claimOrderKey([seed(1), seed(2)], 0));
  });

  it('lays claims out in the frozen order, with claims it does not know after their group', () => {
    const frozen = freezeClaimOrder('k', [seed(2), seed(1), seed(4), seed(3)]);
    // Claim 5 arrived later, in the agenda group; claim 6 in the rest.
    const seeds = [seed(1), seed(5), seed(2), seed(3), seed(6), seed(4)];
    expect(titles(applyFrozenClaimOrder({ seeds, leadingCount: 3, frozen }))).toEqual([
      'Claim 2',
      'Claim 1',
      'Claim 5',
      'Claim 4',
      'Claim 3',
      'Claim 6',
    ]);
  });
});
