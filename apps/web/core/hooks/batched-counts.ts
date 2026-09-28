import { uuidToHex } from '~/core/id/normalize';

/**
 * What a batched aggregate knows about a screenful of rows.
 *
 * Two hooks count things for a whole feed in one request rather than one per row —
 * `useEntityCommentCounts` and `useDebateClaimCounts`. Both key their map by canonical id, and both
 * documented that an absent entry means "not answered yet, not zero". The call sites then read them
 * with `?? 0`, which says the opposite, and the rows hide a branch when a count is zero.
 *
 * While the request is in flight that is a flash. When it *fails* it is permanent: a debate's
 * extracted claims and its entire discussion become unreachable, with no control to expand them,
 * because one aggregate returned an error. So the failure travels with the map and {@link countFor}
 * is the only way to read an entry, because the policy is the part that was getting lost.
 */
export type BatchedCounts = {
  /** Canonical entity id → count. An absent entry means the request has not answered for that id. */
  counts: Map<string, number>;
  /** The request failed, so no answer is coming for anything in this set. */
  isUnavailable: boolean;
};

const NO_COUNTS = new Map<string, number>();

/** Nothing answered yet. Stable, so a caller holding it in a dependency list does not rebuild. */
const UNANSWERED: BatchedCounts = { counts: NO_COUNTS, isUnavailable: false };
/** Nothing answered, and nothing will. */
const UNAVAILABLE: BatchedCounts = { counts: NO_COUNTS, isUnavailable: true };

/**
 * A query's state as counts, shared by both batched hooks so the three cases are decided once.
 *
 * Data wins over the error: React Query keeps the last payload through a failed *refetch*, and
 * numbers a minute old are a better answer than "unknown".
 */
export function batchedCounts(counts: Map<string, number> | undefined, isError: boolean): BatchedCounts {
  if (counts != null) return { counts, isUnavailable: false };
  return isError ? UNAVAILABLE : UNANSWERED;
}

/**
 * One row's count: a number, or `null` when there is no answer and none is coming.
 *
 * `null` means "there may be something here" and callers have to treat it that way — draw the expand
 * control, mount the branch, let the list fetch. It is the choice the claim page's Activity heading
 * already makes with its own aggregate: unavailable falls through to the live count rather than
 * printing a zero. The cost on that path is a toggle that may turn out to have nothing under it,
 * which is the cheaper of the two ways to be wrong.
 *
 * Loading still reads as `0`, deliberately. It is bounded by one request and only ever corrects
 * upward, whereas failing open until the aggregate answers would mount every debate's branch on
 * every page load — fetching the transcript of a claimless debate, which is the exact work these
 * aggregates were added to avoid.
 */
export function countFor({ counts, isUnavailable }: BatchedCounts, entityId: string): number | null {
  return counts.get(uuidToHex(entityId)) ?? (isUnavailable ? null : 0);
}
