import { normId } from '~/core/utils/norm-id';

import { type BallotGrades, NO_GRADES } from './ranking-grades';

/**
 * How many changes a draft ranking holds against the published one, as the ranker would count
 * them: each debate added, each removed, and each kept debate that moved (its order among the kept
 * ones changed). Zero means there is nothing to publish.
 */
export function countBallotChanges(
  published: readonly string[],
  draft: readonly string[],
  /** Best debates (GEO-3729): a regrade is a change too, and a debate both moved and regraded counts once. */
  grades: { published: BallotGrades; draft: BallotGrades } = { published: NO_GRADES, draft: NO_GRADES }
): number {
  const pub = published.map(normId);
  const dra = draft.map(normId);
  const inPub = new Set(pub);
  const inDraft = new Set(dra);
  const added = dra.filter(id => !inPub.has(id)).length;
  const removed = pub.filter(id => !inDraft.has(id)).length;
  const regraded = new Set(
    pub.filter(id => inDraft.has(id) && (grades.published.get(id) ?? null) !== (grades.draft.get(id) ?? null))
  );
  // Of the ways to read the moves, the one that has the regraded debates do the moving, so a debate
  // both moved and regraded counts once.
  const changed = movedEntries(published, draft, regraded);
  for (const id of regraded) changed.add(id);
  return added + removed + changed.size;
}

/**
 * The kept debates (in both lists) that moved: those outside one longest run both orders share.
 * When several runs are as long, the one that leaves `preferMoved` out is chosen. Keys are `normId`s.
 */
export function movedEntries(
  before: readonly string[],
  after: readonly string[],
  preferMoved: ReadonlySet<string> = new Set()
): Set<string> {
  const inBefore = new Set(before.map(normId));
  const inAfter = new Set(after.map(normId));
  const a = before.map(normId).filter(id => inAfter.has(id));
  const b = after.map(normId).filter(id => inBefore.has(id));
  const kept = longestCommonRun(a, b, preferMoved);
  return new Set(a.filter(id => !kept.has(id)));
}

/** The ids of one longest common subsequence of `a` and `b`, keeping as few of `avoid` as it can. */
function longestCommonRun(a: readonly string[], b: readonly string[], avoid: ReadonlySet<string>): Set<string> {
  // Fast path: nothing moved (the usual case on every keystroke of the ranking screen).
  if (a.length === b.length && a.every((id, i) => id === b[i])) return new Set(a);
  // Each kept debate scores TIE_BREAK, plus one when it isn't one to avoid: longest first, then fewest avoided.
  const TIE_BREAK = 10_000;
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      table[i * width + j] =
        a[i - 1] === b[j - 1]
          ? table[(i - 1) * width + j - 1] + TIE_BREAK + (avoid.has(a[i - 1]) ? 0 : 1)
          : Math.max(table[(i - 1) * width + j], table[i * width + j - 1]);
    }
  }
  const kept = new Set<string>();
  for (let i = a.length, j = b.length; i > 0 && j > 0;) {
    if (a[i - 1] === b[j - 1]) {
      kept.add(a[i - 1]);
      i--;
      j--;
    } else if (table[(i - 1) * width + j] >= table[i * width + j - 1]) i--;
    else j--;
  }
  return kept;
}

/** "1 change not published", "3 changes not published". */
export function unpublishedChangesLabel(count: number): string {
  return count === 1 ? '1 change not published' : `${count} changes not published`;
}
