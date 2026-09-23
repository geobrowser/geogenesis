import { uuidToHex } from '~/core/id/normalize';

import type { ClaimTiming } from '~/core/debates/claim-timing';
import type { TranscriptClaim } from '~/core/debates/transcript-claims';

/**
 * Ordering for the claim page's activity feed.
 *
 * Two orders, because the levels are answering different questions. The top level is a feed and
 * takes the reader's sort. Under a debate the rows are a transcript, and a transcript has one
 * correct order: the order the words were said in.
 */

export type OrderedTranscriptClaim = TranscriptClaim & {
  /** When it was said, or null where no source could place it. */
  timing: ClaimTiming | null;
};

/**
 * A debate's extracted claims, in the order they were spoken, with the unplaceable ones after.
 *
 * **Not** `position` order. `groupTranscriptClaims` returns claims ordered by the relation's
 * `position`, and those are published with `Position.generate()`, which is random rather than
 * monotonic. That order is stable across reads, so it looks deliberate — it is arbitrary, and
 * reading it as chronology is the mistake this function exists to prevent. Real order comes from
 * `claim-timing.ts` and nowhere else.
 *
 * Claims with no timing keep their arrival order in the tail rather than being sorted among
 * themselves. There is nothing to sort them by, and imposing an order on them would say they have
 * one. Two cases land here: a debate whose transcript could not place a phrase, and a `restated`
 * claim, which `resolveClaimTimings` deliberately declines to time because the same claim entity
 * linked from two turns cannot answer "when" for either of them.
 */
export function orderExtractedClaims(
  claims: TranscriptClaim[],
  timings: Map<string, ClaimTiming>
): { timed: OrderedTranscriptClaim[]; untimed: OrderedTranscriptClaim[] } {
  const timed: OrderedTranscriptClaim[] = [];
  const untimed: OrderedTranscriptClaim[] = [];

  for (const claim of claims) {
    const timing = timings.get(uuidToHex(claim.id)) ?? null;
    if (timing === null) {
      untimed.push({ ...claim, timing: null });
    } else {
      timed.push({ ...claim, timing });
    }
  }

  // Ties broken by id, so two claims sharing a start — the same phrase matched to one window — do
  // not swap places between renders and make the list look like it is still loading.
  timed.sort((a, b) => a.timing!.startMs - b.timing!.startMs || a.id.localeCompare(b.id));

  return { timed, untimed };
}

/** Anything the top-level feed can order: a comment, or a row standing in for another entity. */
export type ActivityOrderable = {
  id: string;
  /** ISO timestamp. Unparseable values sort last rather than to 1970 — see {@link activityTime}. */
  createdAt: string;
};

/** How a caller looks up a row's votes. Null where nothing has answered for that row yet. */
export type ActivityScoreLookup = (row: ActivityOrderable) => { positive: number; negative: number } | null;

const NO_SCORES: ActivityScoreLookup = () => null;

/**
 * The instant a row claims, for ordering purposes.
 *
 * An unparseable or missing timestamp answers `-Infinity` for newest-first, which puts the row at
 * the end of the list rather than at the top of it. A row with no date is not the newest thing that
 * ever happened, and `new Date(undefined).getTime()` is `NaN`, which makes every comparison false
 * and leaves a sort silently unstable rather than merely wrong.
 */
export function activityTime(row: ActivityOrderable): number {
  const ms = new Date(row.createdAt).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/**
 * Comments and non-comment rows in one time-ordered sequence.
 *
 * Generic over both sides rather than typed to `CommentWithReplies`, so the comment list can stay
 * the only thing that knows what a comment is. Callers get back a tagged union and render each arm
 * with the component that owns it.
 *
 * Stable within a timestamp: rows that arrive at the same instant keep the order their own lists
 * gave them, and comments come first. A debate and a comment published in the same second is not a
 * tie worth breaking on identity, and reordering on every render is worse than either choice.
 */
export function mergeActivityRows<C extends ActivityOrderable, E extends ActivityOrderable>(
  comments: C[],
  extras: E[],
  order: 'best' | 'top' | 'newest' | 'oldest',
  scoreFor: ActivityScoreLookup = NO_SCORES
): Array<{ kind: 'comment'; row: C } | { kind: 'extra'; row: E }> {
  const merged: Array<{ kind: 'comment'; row: C } | { kind: 'extra'; row: E }> = [
    ...comments.map(row => ({ kind: 'comment' as const, row })),
    ...extras.map(row => ({ kind: 'extra' as const, row })),
  ];

  // `sort` is stable in every engine we target, so rows that compare equal keep insertion order —
  // which above is "comments, then extras". Said out loud because the tie-break is a decision.
  if (order === 'newest' || order === 'oldest') {
    const direction = order === 'newest' ? -1 : 1;
    merged.sort((a, b) => direction * (activityTime(a.row) - activityTime(b.row)));
    return merged;
  }

  // Newest breaks a score tie, so a thread where nothing has been voted on yet still reads as a
  // thread rather than as whatever order the two lists happened to arrive in. It is also what the
  // list falls back to while the counts are still arriving, since an unanswered row scores zero.
  const rank = order === 'best' ? netScoreOf : upvotesOf;
  merged.sort((a, b) => rank(scoreFor(b.row)) - rank(scoreFor(a.row)) || activityTime(b.row) - activityTime(a.row));

  return merged;
}

/** Net of the two directions: a row people disagree about falls behind one they merely like. */
function netScoreOf(counts: { positive: number; negative: number } | null): number {
  return counts ? counts.positive - counts.negative : 0;
}

/** Upvotes alone: how many backed it, regardless of how many pushed back. */
function upvotesOf(counts: { positive: number; negative: number } | null): number {
  return counts?.positive ?? 0;
}
