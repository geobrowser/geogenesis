import { normId } from '~/core/utils/norm-id';

/**
 * Grades on a Best debates ballot (GEO-3729). A ranker grades a debate A, B or C; the grade is a
 * label they assign and is stored, never worked out from a position. The ballot keeps its tiers
 * as contiguous blocks, all A first, then B, then C, so the order gaia scores is the order the
 * grades describe. Entries with no grade (a ballot from before grades, or an agent that wrote
 * order only) sit below C. D is Down rank, which takes the debate off the ballot, so it is never
 * stored here.
 *
 * Everything here is pure. A ballot is its ordered ids plus a grade per id (`BallotGrades`,
 * keyed by `normId`). The grade is written as a `Grade` text value on each ballot entry's vote
 * entity (see `fetch-ballot-grades.ts` and `vote-grade-ops.ts`).
 */

export type Grade = 'A' | 'B' | 'C';

export const GRADES: readonly Grade[] = ['A', 'B', 'C'];

/** Grade per entry, keyed by `normId(entityId)`. Entries missing from it are ungraded. */
export type BallotGrades = ReadonlyMap<string, Grade>;

/**
 * An edit's grades: a grade or `null` (explicitly ungraded) per entry it sets. An entry missing
 * from it keeps the grade it already has, so a publish that doesn't know about grades (Down rank's
 * removal, a remove on the ranking view) never wipes them.
 */
export type GradeEdits = ReadonlyMap<string, Grade | null>;

export const NO_GRADES: BallotGrades = new Map();

export type Tier = Grade | 'ungraded';

const TIER_RANK: Record<Tier, number> = { A: 0, B: 1, C: 2, ungraded: 3 };

export function parseGrade(text: string | null | undefined): Grade | null {
  const value = text?.trim().toUpperCase();
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}

export function gradeOf(grades: BallotGrades, entityId: string): Grade | null {
  return grades.get(normId(entityId)) ?? null;
}

export function tierOf(grades: BallotGrades, entityId: string): Tier {
  return gradeOf(grades, entityId) ?? 'ungraded';
}

export function hasAnyGrade(ids: readonly string[], grades: BallotGrades): boolean {
  return ids.some(id => grades.has(normId(id)));
}

/** The grades of the entries in `ids` only: what a ballot of `ids` should publish. */
export function pruneGrades(ids: readonly string[], grades: BallotGrades): BallotGrades {
  const next = new Map<string, Grade>();
  for (const id of ids) {
    const grade = grades.get(normId(id));
    if (grade) next.set(normId(id), grade);
  }
  return next;
}

/** Same grades for every entry in `ids`. */
export function sameGrades(ids: readonly string[], a: BallotGrades, b: BallotGrades): boolean {
  return ids.every(id => (a.get(normId(id)) ?? null) === (b.get(normId(id)) ?? null));
}

/**
 * Where an entry graded `grade` goes (Preston, 14 Nov: the top of its tier, so a new A reaches the
 * head of Best at once rather than queueing behind every older A as place values fade): right
 * before the first entry of that tier, or, when the tier is empty, right after the last entry of a
 * higher tier (so before every lower tier and every ungraded entry). The top of the list when
 * neither exists.
 */
function topOfTierIndex(ids: readonly string[], grades: BallotGrades, grade: Grade): number {
  let firstSame = -1;
  let lastHigher = -1;
  ids.forEach((id, index) => {
    const tier = tierOf(grades, id);
    if (tier === grade && firstSame === -1) firstSame = index;
    else if (TIER_RANK[tier] < TIER_RANK[grade]) lastHigher = index;
  });
  return firstSame !== -1 ? firstSame : lastHigher + 1;
}

export type GradedBallot = { ids: string[]; grades: BallotGrades };

/** Grades a debate and moves it to the top of that tier (it joins the ballot if it wasn't on it). */
export function gradeInto(ids: readonly string[], grades: BallotGrades, entityId: string, grade: Grade): GradedBallot {
  const key = normId(entityId);
  const rest = ids.filter(id => normId(id) !== key);
  const nextGrades = new Map(grades);
  nextGrades.delete(key);
  const at = topOfTierIndex(rest, nextGrades, grade);
  nextGrades.set(key, grade);
  return { ids: [...rest.slice(0, at), entityId, ...rest.slice(at)], grades: nextGrades };
}

/** Takes a debate out of the ballot, with its grade. */
export function removeEntry(ids: readonly string[], grades: BallotGrades, entityId: string): GradedBallot {
  const key = normId(entityId);
  const nextGrades = new Map(grades);
  nextGrades.delete(key);
  return { ids: ids.filter(id => normId(id) !== key), grades: nextGrades };
}

/**
 * One press of ↑ or ↓ on a graded debate (GEO-3729): it swaps with its neighbour within its tier.
 * At a tier's edge the press moves it across the line instead, as a drag across a header does: it
 * takes the neighbour's tier and keeps its place (↑ from the top of B makes it the bottom A).
 * Nothing changes at either end of the ballot, or for a debate that isn't on it.
 */
export function stepEntry(
  ids: readonly string[],
  grades: BallotGrades,
  entityId: string,
  direction: -1 | 1
): GradedBallot {
  const key = normId(entityId);
  const at = ids.findIndex(id => normId(id) === key);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= ids.length) return { ids: [...ids], grades };
  const neighbourTier = tierOf(grades, ids[to]);
  if (neighbourTier === tierOf(grades, entityId)) {
    const next = [...ids];
    next[at] = ids[to];
    next[to] = ids[at];
    return { ids: next, grades };
  }
  const nextGrades = new Map(grades);
  if (neighbourTier === 'ungraded') nextGrades.delete(key);
  else nextGrades.set(key, neighbourTier);
  return { ids: [...ids], grades: nextGrades };
}

/**
 * Puts a debate taken out of the ballot back where it was in `before`, with the grade it had
 * there, into the ballot as it is now (later edits kept), within its tier. Nothing changes when it is already back
 * or wasn't in `before`. The ranking screen's Undo of a Down rank from the popup.
 */
export function restoreEntry(current: GradedBallot, before: GradedBallot, entityId: string): GradedBallot {
  const key = normId(entityId);
  if (current.ids.some(id => normId(id) === key)) return current;
  const at = before.ids.findIndex(id => normId(id) === key);
  if (at < 0) return current;
  const ids = [...current.ids.slice(0, at), entityId, ...current.ids.slice(at)];
  const grade = before.grades.get(key);
  const grades = new Map(current.grades);
  if (grade) grades.set(key, grade);
  // Its old place may sit in another tier now: the tiers win, the order within them is kept.
  return { ids: sortIntoTiers(ids, grades), grades };
}

/**
 * The tier a debate placed at `index` of `ids` (a flat position: the compare flow, or a drop from
 * the team column) belongs to: the tier of the entry above it. At the top, the tier of the first
 * entry. A ballot with no grades at all stays ungraded.
 */
export function tierAtIndex(ids: readonly string[], grades: BallotGrades, index: number): Tier {
  if (!hasAnyGrade(ids, grades)) return 'ungraded';
  if (ids.length === 0) return 'ungraded';
  const above = index > 0 ? ids[Math.min(index, ids.length) - 1] : ids[0];
  return tierOf(grades, above);
}

/** Gives `entityId`, now placed in `ids`, the tier at its place (`tierAtIndex` on the rest). */
export function gradeAtPlace(ids: readonly string[], grades: BallotGrades, entityId: string): BallotGrades {
  const key = normId(entityId);
  const index = ids.findIndex(id => normId(id) === key);
  if (index === -1) return grades;
  const rest = ids.filter(id => normId(id) !== key);
  const restGrades = new Map(grades);
  restGrades.delete(key);
  const tier = tierAtIndex(rest, restGrades, index);
  if (tier !== 'ungraded') restGrades.set(key, tier);
  return restGrades;
}

export type TierSection = {
  tier: Tier;
  /** The section's entries, in ballot order. */
  ids: string[];
  /** Index in the ballot of the section's first entry (or where it would start, when empty). */
  start: number;
};

/**
 * The sections the ranking screen draws: A, B and C always (an empty one is still a place to drop
 * into), then Ungraded when anything is. A ballot with no grades at all is one Ungraded section.
 * Expects a tier-ordered ballot; anything out of order is listed in its tier's section.
 */
export function tierSections(ids: readonly string[], grades: BallotGrades): TierSection[] {
  if (!hasAnyGrade(ids, grades)) return ids.length ? [{ tier: 'ungraded', ids: [...ids], start: 0 }] : [];
  const byTier: Record<Tier, string[]> = { A: [], B: [], C: [], ungraded: [] };
  for (const id of ids) byTier[tierOf(grades, id)].push(id);
  const sections: TierSection[] = [];
  let start = 0;
  for (const tier of ['A', 'B', 'C', 'ungraded'] as const) {
    if (tier === 'ungraded' && byTier.ungraded.length === 0) continue;
    sections.push({ tier, ids: byTier[tier], start });
    start += byTier[tier].length;
  }
  return sections;
}

/**
 * The one-time "Grade your ranking" step: the first `aCount` entries become A, the next `bCount`
 * B, the rest C. The order doesn't change.
 */
export function applyTierLines(ids: readonly string[], aCount: number, bCount: number): BallotGrades {
  const grades = new Map<string, Grade>();
  ids.forEach((id, index) => grades.set(normId(id), index < aCount ? 'A' : index < aCount + bCount ? 'B' : 'C'));
  return grades;
}

/**
 * Applies an edit's grades on top of the grades it was built on: an entry the edit sets takes that
 * grade (`null` clears it); every other entry keeps its own.
 */
export function applyGradeEdits(base: BallotGrades, edits: GradeEdits): BallotGrades {
  const next = new Map(base);
  for (const [key, grade] of edits) {
    if (grade) next.set(key, grade);
    else next.delete(key);
  }
  return next;
}

/**
 * Three-way merge of grades for the merged ballot `ids`, entry by entry: this edit's grade where it
 * changed it from the grades it was built on (`base`), else the published grade (`theirs`, which
 * holds another device's regrades), else this edit's. Works with `mergeBallotOrders`.
 */
export function mergeGrades({
  ids,
  base,
  ours,
  theirs,
  theirIds,
}: {
  ids: readonly string[];
  base: BallotGrades;
  ours: BallotGrades;
  theirs: BallotGrades;
  /** The entries of the published ballot `theirs` describes: an entry there with no grade was ungraded there. */
  theirIds: readonly string[];
}): BallotGrades {
  const inTheirs = new Set(theirIds.map(normId));
  const merged = new Map<string, Grade>();
  for (const id of ids) {
    const key = normId(id);
    const our = ours.get(key) ?? null;
    const grade = our !== (base.get(key) ?? null) || !inTheirs.has(key) ? our : (theirs.get(key) ?? null);
    if (grade) merged.set(key, grade);
  }
  return merged;
}

/**
 * The ballot in tier order (A, B, C, ungraded), keeping the order within each tier. Entries
 * `toTop` names go to the top of their tier (still in order among themselves).
 */
export function sortIntoTiers(
  ids: readonly string[],
  grades: BallotGrades,
  toTop: (id: string) => boolean = () => false
): string[] {
  return ids
    .map((id, index) => ({ id, index, rank: TIER_RANK[tierOf(grades, id)], top: toTop(id) ? 0 : 1 }))
    .sort((a, b) => a.rank - b.rank || a.top - b.top || a.index - b.index)
    .map(entry => entry.id);
}

// ---------------------------------------------------------------------------------------------
// Copy (approved with the GEO-3729 mockup).
// ---------------------------------------------------------------------------------------------

export const GRADE_ROW_LABEL = 'Grade';
export const GRADE_DOWN_RANK_TITLE = 'Down rank';
export const GRADE_REMOVE_LABEL = 'Remove';
export const GRADE_SAVING_COPY = 'Saving…';
export const GRADE_DOWN_RANKED_COPY = 'Down ranked';
export const GRADE_UNDO_LABEL = 'Undo';
export const GRADE_RANKING_FIRST_COPY = 'Grade your ranking first';
export const GRADE_IT_LABEL = 'Grade it';
export const UNGRADED_SECTION_LABEL = 'Ungraded';

export function gradePlaceCopy(place: number): string {
  return `#${place} in your ranking`;
}
