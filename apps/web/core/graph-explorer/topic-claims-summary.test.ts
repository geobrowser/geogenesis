import { describe, expect, it } from 'vitest';

import { claimsHeadline, summariseTopicClaims } from './topic-claims-summary';

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
    expect(summary.truncated).toBe(false);
  });

  it('is empty without responses and keeps the truncation flag', () => {
    expect(summariseTopicClaims([claim('a', 'A')], () => undefined, true)).toEqual({
      claims: [],
      truncated: true,
    });
  });
});

describe('claimsHeadline', () => {
  const answered = (positive: number, negative: number, band: 'agreed' | 'contested' | 'rejected') => ({
    id: `${positive}-${negative}`,
    name: 'c',
    spaceId: 's',
    positive,
    negative,
    band,
  });

  it('counts and bands only claims with 3+ responses', () => {
    expect(claimsHeadline([answered(3, 0, 'agreed'), answered(1, 0, 'agreed'), answered(1, 4, 'rejected')])).toEqual({
      text: '2 claims with 3+ responses',
      bands: { agreed: 1, contested: 0, rejected: 1 },
      banded: 2,
    });
    expect(claimsHeadline([answered(2, 1, 'agreed')])?.text).toBe('1 claim with 3+ responses');
  });

  it('says how many have responses when none has 3, and nothing with none', () => {
    expect(claimsHeadline([answered(1, 0, 'agreed')])).toEqual({
      text: '1 claim has responses so far',
      bands: null,
      banded: 0,
    });
    expect(claimsHeadline([answered(1, 0, 'agreed'), answered(0, 2, 'rejected')])?.text).toBe(
      '2 claims have responses so far'
    );
    expect(claimsHeadline([])).toBeNull();
  });
});
