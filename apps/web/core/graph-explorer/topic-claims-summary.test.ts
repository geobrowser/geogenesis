import { describe, expect, it } from 'vitest';

import { summariseTopicClaims } from './topic-claims-summary';

const row = (objectId: string, userId: string, voteType: number) => ({ objectId, userId, voteType, voteKind: 1 });

describe('summariseTopicClaims', () => {
  it('bands only the topic’s answered claims, counts one response per person, most responses first', () => {
    const summary = summariseTopicClaims(
      [
        row('a', 'u1', 0),
        row('a', 'u2', 0),
        row('a', 'u3', 0),
        row('b', 'u1', 0),
        row('b', 'u1', 1), // u1 changed their mind: the later row counts
        row('c', 'u1', 0),
        row('c', 'u2', 1),
        row('other', 'u1', 0),
      ],
      [
        { id: 'a', name: 'Agreed claim' },
        { id: 'b', name: 'Rejected claim' },
        { id: 'c', name: 'Contested claim' },
        { id: 'd', name: 'No responses' },
      ]
    );
    expect(summary.claims.map(claim => [claim.id, claim.band, claim.positive, claim.negative])).toEqual([
      ['a', 'agreed', 3, 0],
      ['c', 'contested', 1, 1],
      ['b', 'rejected', 0, 1],
    ]);
    expect(summary.bands).toEqual({ agreed: 1, contested: 1, rejected: 1 });
  });

  it('is empty without responses', () => {
    expect(summariseTopicClaims([], [{ id: 'a', name: 'A' }])).toEqual({
      claims: [],
      bands: { agreed: 0, contested: 0, rejected: 0 },
    });
  });
});
