/**
 * How far the branches this feature draws go before they stop and point elsewhere.
 *
 * Counted from the root, the way Reddit counts it, rather than as a budget each level subtracts
 * from. The arithmetic used to be spread across three files — `ACTIVITY_MAX_DEPTH - 2` in two
 * places, `maxDepth - 1` in a third, `depth < maxDepth` in a fourth — which was correct but had to
 * be hand-verified to stay that way. A row now knows only its own depth and asks one question.
 *
 * Scope, because this used to say "the claim page's activity feed" and that reads as more than it is:
 * it governs the rows drawn *under a debate* — the claims extracted from it, the comments on those,
 * and the replies to those (`extracted-claim-row`, `debate-comment-row`). The claim's ordinary comment
 * thread is `CommentList`, which predates this and recurses without a floor, on this page and on every
 * other page that has comments. So a long enough reply chain on the claim itself still draws past four
 * while a debate's branch does not. Giving the shared list a floor is a change to every comment thread
 * in the app and belongs in its own PR, not in this constant's contract.
 */

/** A debate or a top-level comment: the first thing under the claim. */
export const ACTIVITY_ROOT_DEPTH = 1;

/**
 * The deepest level drawn.
 *
 * Four: a debate, the claims it produced, the comments on one of those, and the replies to those.
 *
 * Deliberately not Reddit's ~9–10. Reddit affords that because every node is the same cheap thing —
 * a line of text at ~20px of indent. Ours are not: a claim row carries a vote control, responder
 * faces and a comment count; a debate row carries a keyframe. At 44–56px of indent per level, four
 * already spends ~180px, which at side-panel width is most of what there is.
 */
export const ACTIVITY_MAX_DEPTH = 4;

/**
 * Whether a row at this depth may draw its children.
 *
 * A row at the floor still *has* children — they are counted and offered, just not drawn. See
 * `ThreadOverflow`, which is what the reader gets instead.
 */
export function canNestBelow(depth: number): boolean {
  return depth < ACTIVITY_MAX_DEPTH;
}
