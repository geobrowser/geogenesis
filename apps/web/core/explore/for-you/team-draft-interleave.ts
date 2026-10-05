/**
 * Team-draft interleaving (Radlinski, Kurup and Joachims, 2008) of two ranked lists (GEO-3144).
 *
 * Each round, the arm with fewer picks so far picks next; when they are level a coin decides, so
 * which version leads is random and neither is favoured by position. An arm picks its highest-ranked
 * item not already on the page, so an item both versions wanted appears once and is credited to
 * whichever arm took it first; over many pages that credit is shared fairly. When one list runs
 * out the other fills the rest, still credited to itself.
 *
 * Pure and seeded, because Explore cuts several pages from one window by offset: the same window
 * has to interleave identically on every request.
 */

export type InterleavedItem<T> = { item: T; arm: 'a' | 'b' };

/** mulberry32. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function teamDraftInterleave<T>(
  a: readonly T[],
  b: readonly T[],
  idOf: (item: T) => string,
  random: () => number
): InterleavedItem<T>[] {
  const out: InterleavedItem<T>[] = [];
  const taken = new Set<string>();
  let ia = 0;
  let ib = 0;
  let picksA = 0;
  let picksB = 0;

  const nextFrom = (list: readonly T[], index: number): number => {
    let i = index;
    while (i < list.length && taken.has(idOf(list[i] as T))) i += 1;
    return i;
  };

  while (true) {
    ia = nextFrom(a, ia);
    ib = nextFrom(b, ib);
    const aLeft = ia < a.length;
    const bLeft = ib < b.length;
    if (!aLeft && !bLeft) break;

    const pickA = !bLeft || (aLeft && (picksA < picksB || (picksA === picksB && random() < 0.5)));
    if (pickA) {
      const item = a[ia] as T;
      taken.add(idOf(item));
      out.push({ item, arm: 'a' });
      picksA += 1;
    } else {
      const item = b[ib] as T;
      taken.add(idOf(item));
      out.push({ item, arm: 'b' });
      picksB += 1;
    }
  }
  return out;
}
