import { describe, expect, it } from 'vitest';

import { summariseTopicClaims } from './topic-claims-summary';

const claim = (id: string, name: string) => ({ id, name, spaceId: 's' });

describe('summariseTopicClaims', () => {
  it('bands only answered claims, most responses first', () => {
    const counts: Record<string, { positive: number; negative: number }> = {
      a: { positive: 3, negative: 0 },
      b: { positive: 0, negative: 1 },
      c: { positive: 1, negative: 1 },
      d: { positive: 0, negative: 0 },
    };
    const summary = summariseTopicClaims(
      [
        claim('a', 'Agreed claim'),
        claim('b', 'Rejected claim'),
        claim('c', 'Contested claim'),
        claim('d', 'No responses'),
        claim('e', 'Not counted'),
      ],
      entry => counts[entry.id]
    );
    expect(summary.claims.map(entry => [entry.id, entry.band, entry.positive, entry.negative])).toEqual([
      ['a', 'agreed', 3, 0],
      ['c', 'contested', 1, 1],
      ['b', 'rejected', 0, 1],
    ]);
    expect(summary.bands).toEqual({ agreed: 1, contested: 1, rejected: 1 });
    expect(summary.truncated).toBe(false);
  });

  it('is empty without responses and keeps the truncation flag', () => {
    expect(summariseTopicClaims([claim('a', 'A')], () => undefined, true)).toEqual({
      claims: [],
      bands: { agreed: 0, contested: 0, rejected: 0 },
      truncated: true,
    });
  });
});
