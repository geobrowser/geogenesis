/**
 * Placing a new entry in an ordered list by asking "which was better?" (GEO-3678).
 *
 * A binary search over the list, best first. Each comparison shows the new entry next to the one in
 * the middle of the range it could still go in: "This one" (the new entry was better) keeps the
 * upper half, "That one" keeps the lower half, and "About the same" stops early and puts it straight
 * below the one shown. A 200-entry list takes at most 8 choices, 1,000 at most 10.
 *
 * Pure, so the dialog only renders whatever state this hands it. Ids compare by `normId`: the
 * ranking screen holds dashed and dashless spellings of the same entity side by side.
 */
import { normId } from '~/core/utils/norm-id';

export type PlacementChoice = 'new' | 'existing' | 'same';

export type PlacementSearch = {
  /** First index the new entry could still take. */
  lo: number;
  /** One past the last index it could still take. */
  hi: number;
  /** The comparison on screen, from 1. */
  step: number;
  /** Comparisons expected in all, never fewer than `step`. */
  expectedSteps: number;
};

export type PlacementResult = { done: false; search: PlacementSearch } | { done: true; index: number };

/** The most comparisons a list of `length` entries can take: ⌈log₂(length + 1)⌉. */
export function expectedPlacementSteps(length: number): number {
  return length <= 0 ? 0 : Math.ceil(Math.log2(length + 1));
}

/** Where a placement starts. An empty list places at once, at #1. */
export function startPlacement(length: number): PlacementResult {
  if (length <= 0) return { done: true, index: 0 };
  return { done: false, search: { lo: 0, hi: length, step: 1, expectedSteps: expectedPlacementSteps(length) } };
}

/** The index of the entry the new one is compared with. */
export function placementComparisonIndex(search: PlacementSearch): number {
  return Math.floor((search.lo + search.hi) / 2);
}

export function choosePlacement(search: PlacementSearch, choice: PlacementChoice): PlacementResult {
  const mid = placementComparisonIndex(search);
  if (choice === 'same') return { done: true, index: mid + 1 };

  const lo = choice === 'existing' ? mid + 1 : search.lo;
  const hi = choice === 'new' ? mid : search.hi;
  if (lo >= hi) return { done: true, index: lo };

  const step = search.step + 1;
  return { done: false, search: { lo, hi, step, expectedSteps: Math.max(search.expectedSteps, step) } };
}

/** `list` with `entityId` taken out and put back at `index`. */
export function insertAt(list: readonly string[], entityId: string, index: number): string[] {
  const without = list.filter(id => normId(id) !== normId(entityId));
  const at = Math.max(0, Math.min(index, without.length));
  return [...without.slice(0, at), entityId, ...without.slice(at)];
}

/** `list` with the entry at `entityId` swapped one place up (-1) or down (+1); unchanged at an edge. */
export function nudge(list: readonly string[], entityId: string, direction: -1 | 1): string[] {
  const from = indexOfEntity(list, entityId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  next[from] = list[to];
  next[to] = list[from];
  return next;
}

/** The index of `entityId` in `list`, whatever its spelling; -1 when absent. */
export function indexOfEntity(list: readonly string[], entityId: string): number {
  const key = normId(entityId);
  return list.findIndex(id => normId(id) === key);
}
