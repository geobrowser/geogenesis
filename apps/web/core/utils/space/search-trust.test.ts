import { describe, expect, it } from 'vitest';

import { isTrustedSpace, rankBySpace, trustedSpaceSet } from './search-trust';

const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
const WORLD_AFFAIRS = '89bd89bf28ff8a0963faf92a8c905e20';
const AI_MUSIC = '0e964b063541ae7df0f8b8365fb25882';
const PERSONAL = 'bf8d69f36987dee797bae24f586a99fa';

describe('trustedSpaceSet', () => {
  it('normalizes dashed and uppercase ids', () => {
    const set = trustedSpaceSet(['A19C345A-B986-6679-B001-D7D2138D88A1']);
    expect(set.has(ROOT)).toBe(true);
  });
});

describe('isTrustedSpace', () => {
  const allowed = trustedSpaceSet([PERSONAL]);

  it('trusts every ranked space without being told to', () => {
    expect(isTrustedSpace(ROOT, allowed)).toBe(true);
    expect(isTrustedSpace(CRYPTO, allowed)).toBe(true);
    expect(isTrustedSpace(WORLD_AFFAIRS, allowed)).toBe(true);
  });

  it("trusts the caller's own spaces even though they are unranked", () => {
    expect(isTrustedSpace(PERSONAL, allowed)).toBe(true);
  });

  it('rejects an unranked space nobody vouched for', () => {
    expect(isTrustedSpace(AI_MUSIC, allowed)).toBe(false);
  });

  it('matches regardless of id spelling', () => {
    expect(isTrustedSpace('BF8D69F3-6987-DEE7-97BA-E24F586A99FA', allowed)).toBe(true);
    expect(isTrustedSpace('A19C345A-B986-6679-B001-D7D2138D88A1', trustedSpaceSet([]))).toBe(true);
  });
});

describe('rankBySpace', () => {
  const match = (id: string, ...spaceIds: string[]) => ({ id, spaces: spaceIds.map(spaceId => ({ spaceId })) });

  it('puts Root ahead of a lower-ranked space', () => {
    const ranked = rankBySpace([match('wa', WORLD_AFFAIRS), match('root', ROOT)]);
    expect(ranked.map(m => m.id)).toEqual(['root', 'wa']);
  });

  it('puts the current space ahead of Root', () => {
    const matches = [match('root', ROOT), match('mine', PERSONAL)];
    expect(rankBySpace(matches, PERSONAL).map(m => m.id)).toEqual(['mine', 'root']);
    expect(rankBySpace(matches).map(m => m.id)).toEqual(['root', 'mine']);
  });

  it('ranks a multi-space entity by its best space', () => {
    const ranked = rankBySpace([match('ai-only', AI_MUSIC), match('also-root', WORLD_AFFAIRS, ROOT)]);
    expect(ranked.map(m => m.id)).toEqual(['also-root', 'ai-only']);
  });

  it('sinks an entity that belongs to no space', () => {
    const ranked = rankBySpace([match('nowhere'), match('root', ROOT)]);
    expect(ranked.map(m => m.id)).toEqual(['root', 'nowhere']);
  });

  it('keeps the API relevance order within one rank', () => {
    const ranked = rankBySpace([match('first', ROOT), match('second', ROOT), match('third', ROOT)]);
    expect(ranked.map(m => m.id)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input', () => {
    const matches = [match('wa', WORLD_AFFAIRS), match('root', ROOT)];
    rankBySpace(matches);
    expect(matches.map(m => m.id)).toEqual(['wa', 'root']);
  });

  it('normalizes the current space id before comparing', () => {
    const matches = [match('root', ROOT), match('mine', PERSONAL)];
    const ranked = rankBySpace(matches, 'BF8D69F3-6987-DEE7-97BA-E24F586A99FA');
    expect(ranked.map(m => m.id)).toEqual(['mine', 'root']);
  });
});
