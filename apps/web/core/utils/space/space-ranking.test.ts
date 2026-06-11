import { describe, expect, it } from 'vitest';

import { getTopRankedSpaceId, scopeBySpacePrecedence } from './space-ranking';

const ROOT_SPACE = 'a19c345ab9866679b001d7d2138d88a1';
const CRYPTO_SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const PERSONAL_SPACE = 'cf0e11338b33fcd6cdb032c625c85454';
const COMMUNITY_SPACE = 'ffffffffffffffffffffffffffffffff';

describe('scopeBySpacePrecedence', () => {
  const items = (...spaceIds: string[]) => spaceIds.map((spaceId, i) => ({ id: `item-${i}`, spaceId }));

  it('returns items unchanged when no space is given', () => {
    const input = items(COMMUNITY_SPACE, ROOT_SPACE);
    expect(scopeBySpacePrecedence(input)).toEqual(input);
  });

  it('returns items unchanged when input is empty', () => {
    expect(scopeBySpacePrecedence([], PERSONAL_SPACE)).toEqual([]);
  });

  it("prefers the viewing space's own items", () => {
    const own = { id: 'own', spaceId: PERSONAL_SPACE };
    const foreign = { id: 'foreign', spaceId: ROOT_SPACE };
    expect(scopeBySpacePrecedence([foreign, own], PERSONAL_SPACE)).toEqual([own]);
  });

  it('falls back to Root space items when the viewing space has none', () => {
    const fromRoot = { id: 'root', spaceId: ROOT_SPACE };
    const fromCrypto = { id: 'crypto', spaceId: CRYPTO_SPACE };
    const fromCommunity = { id: 'community', spaceId: COMMUNITY_SPACE };
    expect(scopeBySpacePrecedence([fromCommunity, fromCrypto, fromRoot], PERSONAL_SPACE)).toEqual([fromRoot]);
  });

  it('never leaks items from non-Root spaces into another space, even ranked system spaces', () => {
    const fromCrypto = { id: 'crypto', spaceId: CRYPTO_SPACE };
    const fromCommunity = { id: 'community', spaceId: COMMUNITY_SPACE };
    expect(scopeBySpacePrecedence([fromCommunity, fromCrypto], PERSONAL_SPACE)).toEqual([]);
  });
});

describe('getTopRankedSpaceId', () => {
  it('returns null for an empty list', () => {
    expect(getTopRankedSpaceId([])).toBeNull();
  });

  it('returns the highest-ranked space', () => {
    expect(getTopRankedSpaceId([CRYPTO_SPACE, ROOT_SPACE, PERSONAL_SPACE])).toBe(ROOT_SPACE);
  });
});
