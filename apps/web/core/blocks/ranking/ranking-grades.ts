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
 * Where an entry graded `grade` goes: right after the last entry of that tier, or, when the tier
 * is empty, right after the last entry of a higher tier (so before every lower tier and every
 * ungraded entry). The top of the list when neither exists.
 */
function bottomOfTierIndex(ids: readonly string[], grades: BallotGrades, grade: Grade): number {
  let lastSame = -1;
  let lastHigher = -1;
  ids.forEach((id, index) => {
    const tier = tierOf(grades, id);
    if (tier === grade) lastSame = index;
    else if (TIER_RANK[tier] < TIER_RANK[grade]) lastHigher = index;
  });
  return (lastSame !== -1 ? lastSame : lastHigher) + 1;
}

export type GradedBallot = { ids: string[]; grades: BallotGrades };

/** Grades a debate and moves it to the bottom of that tier (it joins the ballot if it wasn't on it). */
export function gradeInto(ids: readonly string[], grades: BallotGrades, entityId: string, grade: Grade): GradedBallot {
  const key = normId(entityId);
  const rest = ids.filter(id => normId(id) !== key);
  const nextGrades = new Map(grades);
  nextGrades.delete(key);
  const at = bottomOfTierIndex(rest, nextGrades, grade);
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
 * After a merge, an entry whose grade came from another device (it differs from this edit's) may
 * still sit where this edit had it. Each such entry moves to the bottom of its new tier, as a
 * regrade does, so the ballot the web publishes stays tier-ordered.
 */
export function placeRegradedEntries(ids: readonly string[], grades: BallotGrades, ourGrades: BallotGrades): string[] {
  let next: GradedBallot = { ids: [...ids], grades };
  for (const id of ids) {
    const grade = grades.get(normId(id)) ?? null;
    if (grade && grade !== (ourGrades.get(normId(id)) ?? null)) next = gradeInto(next.ids, next.grades, id, grade);
  }
  return next.ids;
}

/** The ballot in tier order (A, B, C, ungraded), keeping the order within each tier. */
export function sortIntoTiers(ids: readonly string[], grades: BallotGrades): string[] {
  return ids
    .map((id, index) => ({ id, index, rank: TIER_RANK[tierOf(grades, id)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
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
