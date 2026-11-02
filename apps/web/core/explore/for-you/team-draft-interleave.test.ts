import { describe, expect, it } from 'vitest';

import { hashSeed, seededRandom, teamDraftInterleave } from './team-draft-interleave';

const id = (s: string) => s;

describe('teamDraftInterleave', () => {
  it('keeps every item once, each arm in its own order', () => {
    const a = ['1', '2', '3', '4', '5'];
    const b = ['5', '3', '6', '1', '7'];
    const out = teamDraftInterleave(a, b, id, seededRandom(1));
    const ids = out.map(o => o.item);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set([...a, ...b]));
    // Each arm's picks appear in that arm's rank order.
    for (const [arm, list] of [
      ['a', a],
      ['b', b],
    ] as const) {
      const picks = out.filter(o => o.arm === arm).map(o => list.indexOf(o.item));
      expect(picks).toEqual([...picks].sort((x, y) => x - y));
    }
  });

  it('keeps the arms level until one runs out', () => {
    const a = Array.from({ length: 20 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 20 }, (_, i) => `b${i}`);
    const out = teamDraftInterleave(a, b, id, seededRandom(7));
    for (let n = 2; n <= out.length; n += 2) {
      const prefix = out.slice(0, n);
      expect(prefix.filter(o => o.arm === 'a').length).toBe(n / 2);
    }
  });

  it('credits a shared item to whichever arm took it, once', () => {
    const out = teamDraftInterleave(['x', 'y'], ['x', 'z'], id, () => 0);
    expect(out).toEqual([
      { item: 'x', arm: 'a' },
      { item: 'z', arm: 'b' },
      { item: 'y', arm: 'a' },
    ]);
  });

  it('lets either arm lead, about half the time', () => {
    let aFirst = 0;
    const runs = 4000;
    for (let s = 0; s < runs; s += 1) {
      if (teamDraftInterleave(['1', '2'], ['3', '4'], id, seededRandom(hashSeed(`page-${s}`)))[0]?.arm === 'a')
        aFirst += 1;
    }
    expect(Math.abs(aFirst / runs - 0.5)).toBeLessThan(0.03);
  });

  it('interleaving a list with itself credits each arm half', () => {
    // The A/A sanity check: identical versions must split the page evenly.
    const list = Array.from({ length: 22 }, (_, i) => String(i));
    const out = teamDraftInterleave(list, list, id, seededRandom(3));
    expect(out.map(o => o.item)).toEqual(list);
    expect(out.filter(o => o.arm === 'a')).toHaveLength(11);
  });

  it('fills from the other arm when one runs out', () => {
    const out = teamDraftInterleave(['1'], ['2', '3', '4'], id, () => 0.9);
    expect(out.map(o => `${o.arm}${o.item}`)).toEqual(['b2', 'a1', 'b3', 'b4']);
  });

  it('is deterministic for a seed', () => {
    const a = ['1', '2', '3', '4'];
    const b = ['4', '3', '2', '1'];
    expect(teamDraftInterleave(a, b, id, seededRandom(42))).toEqual(teamDraftInterleave(a, b, id, seededRandom(42)));
  });
});
