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
  /** Best debates (GEO-3729): a regrade is a change too, and a regrade that moved counts once. */
  grades: { published: BallotGrades; draft: BallotGrades } = { published: NO_GRADES, draft: NO_GRADES }
): number {
  const pub = published.map(normId);
  const dra = draft.map(normId);
  const inPub = new Set(pub);
  const inDraft = new Set(dra);
  const added = dra.filter(id => !inPub.has(id)).length;
  const removed = pub.filter(id => !inDraft.has(id)).length;
  // Kept debates in each order; a moved debate is one outside the longest run both orders share.
  const keptPub = pub.filter(id => inDraft.has(id));
  const keptDraft = dra.filter(id => inPub.has(id));
  const moved = keptPub.length - longestCommonSubsequence(keptPub, keptDraft);
  const regraded = keptPub.filter(id => (grades.published.get(id) ?? null) !== (grades.draft.get(id) ?? null)).length;
  return added + removed + Math.max(moved, regraded);
}

function longestCommonSubsequence(a: readonly string[], b: readonly string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let previousDiagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? previousDiagonal + 1 : Math.max(row[j]!, row[j - 1]!);
      previousDiagonal = above;
    }
  }
  return row[b.length]!;
}

/** "1 change not published", "3 changes not published". */
export function unpublishedChangesLabel(count: number): string {
  return count === 1 ? '1 change not published' : `${count} changes not published`;
}
