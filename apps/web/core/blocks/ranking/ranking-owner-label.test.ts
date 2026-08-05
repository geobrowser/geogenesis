import { describe, expect, it } from 'vitest';

import { formatSharedRankingOwnerLabel } from './ranking-owner-label';

describe('formatSharedRankingOwnerLabel', () => {
  it('uses a possessive first name with ranking', () => {
    expect(formatSharedRankingOwnerLabel('Alice Smith')).toBe("Alice's ranking");
    expect(formatSharedRankingOwnerLabel('James')).toBe("James' ranking");
  });

  it('falls back when the author name is missing', () => {
    expect(formatSharedRankingOwnerLabel('')).toBe('Ranking');
    expect(formatSharedRankingOwnerLabel('   ')).toBe('Ranking');
  });
});
