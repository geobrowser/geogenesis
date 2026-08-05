import { describe, expect, it } from 'vitest';

import { mapClaims } from './extract-claims';

describe('mapClaims', () => {
  it('maps each claim to its first document index and passes through is_factual', () => {
    const claims = mapClaims(
      {
        claims: [
          { text: 'Iran was developing a nuclear weapon', document_indices: [0], is_factual: true },
          { text: 'Attacking Iran was wrong', document_indices: [1], is_factual: false },
        ],
      },
      2
    );
    expect(claims).toEqual([
      { text: 'Iran was developing a nuclear weapon', isFactual: true, turnIndex: 0 },
      { text: 'Attacking Iran was wrong', isFactual: false, turnIndex: 1 },
    ]);
  });

  it('uses the first document index when a claim spans multiple turns', () => {
    const claims = mapClaims({ claims: [{ text: 'x', document_indices: [2, 0], is_factual: true }] }, 3);
    expect(claims[0].turnIndex).toBe(2);
  });

  it('defaults is_factual to null when the model did not classify', () => {
    const claims = mapClaims({ claims: [{ text: 'x', document_indices: [0] }] }, 1);
    expect(claims[0].isFactual).toBeNull();
  });

  it('drops claims with no text, no index, or an out-of-range index', () => {
    const claims = mapClaims(
      {
        claims: [
          { text: '   ', document_indices: [0] },
          { text: 'no index' },
          { text: 'out of range', document_indices: [9] },
          { text: 'negative', document_indices: [-1] },
          { text: 'kept', document_indices: [0], is_factual: false },
        ],
      },
      2
    );
    expect(claims).toEqual([{ text: 'kept', isFactual: false, turnIndex: 0 }]);
  });

  it('handles an empty/absent claims array', () => {
    expect(mapClaims({}, 3)).toEqual([]);
    expect(mapClaims({ claims: [] }, 3)).toEqual([]);
  });
});
