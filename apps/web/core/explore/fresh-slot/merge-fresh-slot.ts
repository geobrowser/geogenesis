import type { FreshSlotConfig } from './fresh-slot-config';

export type FreshMergedRow<T> = { row: T; fresh: boolean };

/**
 * Merges the Fresh list into one of Best's windows (GEO-3221).
 *
 * `best` is the window in Best's final order; `fresh` is the pinned Fresh list, newest first; and
 * `shown` holds the indices of `fresh` that earlier windows of this scroll already showed, either
 * as a fresh card or from Best. The window is cut into pages from its start, as the feed serves it,
 * and on each page a fresh item takes positions `firstPosition`, `firstPosition + cadence`, ... up
 * to `maxPerPage` of them and `perTypeCaps` of one type. A slot with no eligible fresh item takes
 * the next Best row. Fresh items never trail the window: once Best runs out the window ends.
 *
 * Dedupe, both ways:
 * - An item in this window's Best has earned its place there (graduated): it is shown from Best
 *   and does not use a slot.
 * - An item an earlier window already showed is dropped from this window's Best.
 *
 * `shownAfter` is what the next window must treat as shown. Pure: the same inputs give the same
 * sequence, which is what lets the feed cut pages from it by offset. Neither the length of the
 * result nor `shownAfter` depends on the order of `best`, only on its membership, so the lead
 * debate can reorder Best without moving any page boundary.
 */
export function mergeFreshSlot<T>(args: {
  best: readonly T[];
  fresh: readonly T[];
  shown: ReadonlySet<number>;
  config: FreshSlotConfig;
  pageSize: number;
  idOf: (row: T) => string;
  typeOf: (row: T) => string;
}): { rows: FreshMergedRow<T>[]; shownAfter: Set<number> } {
  const { config, pageSize, idOf, typeOf } = args;

  const shownIds = new Set<string>();
  for (const index of args.shown) {
    const row = args.fresh[index];
    if (row !== undefined) shownIds.add(idOf(row));
  }
  const best = args.best.filter(row => !shownIds.has(idOf(row)));
  const bestIds = new Set(best.map(idOf));

  const shownAfter = new Set(args.shown);
  const candidates: number[] = [];
  const seen = new Set<string>();
  for (const [index, row] of args.fresh.entries()) {
    if (args.shown.has(index)) continue;
    const id = idOf(row);
    if (bestIds.has(id)) {
      // Graduated: Best shows it in this window.
      shownAfter.add(index);
      continue;
    }
    if (seen.has(id)) {
      shownAfter.add(index);
      continue;
    }
    seen.add(id);
    candidates.push(index);
  }

  const rows: FreshMergedRow<T>[] = [];
  const taken = new Set<number>();
  let bestIndex = 0;
  let pagePosition = 0;
  let freshOnPage = 0;
  let typeCountOnPage = new Map<string, number>();

  const isSlot = (position: number) =>
    config.enabled &&
    freshOnPage < config.maxPerPage &&
    position >= config.firstPosition &&
    (position - config.firstPosition) % config.cadence === 0;

  const nextCandidate = (): number | null => {
    for (const index of candidates) {
      if (taken.has(index)) continue;
      const type = typeOf(args.fresh[index]!);
      const cap = config.perTypeCaps[type];
      if (cap !== undefined && (typeCountOnPage.get(type) ?? 0) >= cap) continue;
      return index;
    }
    return null;
  };

  while (bestIndex < best.length) {
    if (pagePosition === pageSize) {
      pagePosition = 0;
      freshOnPage = 0;
      typeCountOnPage = new Map();
    }
    const position = pagePosition + 1;
    const candidate = isSlot(position) ? nextCandidate() : null;
    if (candidate !== null) {
      const row = args.fresh[candidate]!;
      const type = typeOf(row);
      taken.add(candidate);
      shownAfter.add(candidate);
      freshOnPage += 1;
      typeCountOnPage.set(type, (typeCountOnPage.get(type) ?? 0) + 1);
      rows.push({ row, fresh: true });
    } else {
      rows.push({ row: best[bestIndex]!, fresh: false });
      bestIndex += 1;
    }
    pagePosition += 1;
  }

  return { rows, shownAfter };
}
