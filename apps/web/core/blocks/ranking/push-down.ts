import { ID } from '~/core/id';
import { RANK_VOTES_RELATION_TYPE_ID } from '~/core/ranking-block-ids';
import type { Relation } from '~/core/types';
import { entityHomeSpaceId } from '~/core/utils/space/entity-home-space';

import { DEBATES_SPACE_ID } from './best-debates';

/**
 * Pushing a debate down (GEO-3679): a Debates member's downvote on a debate, in place of a ranking
 * place. Everything here is pure; the writes live in `use-push-down.ts` and the member's list in
 * `use-my-pushed-down-debates.ts`.
 *
 * Ranked and pushed down are exclusive per member, so each switch is two writes, a vote and a
 * ballot edit. They are separate user operations that race for the smart-account nonce if sent
 * together (see `use-entity-vote.ts`), so the second only starts once the first has landed. The
 * order is chosen so a failure never leaves a debate neither ranked nor pushed down:
 *
 * - **Push it down:** downvote, then take it off the ballot. A failed ballot edit leaves it both.
 * - **Rank it:** publish the ballot, then clear the downvotes. A failed clear leaves it both.
 *
 * "Both" is visible and retryable; "neither" would silently lose the member's judgement.
 */

/** What the member asked for: push it down, take the downvote back, or rank it after all. */
export type PushDownAction = 'push-down' | 'undo' | 'rank';

/** Which kind of write is in flight or failed. */
export type PushDownStep = 'vote' | 'ballot';

export type PushDownState =
  | { status: 'idle' }
  | { status: 'working'; action: PushDownAction; step: PushDownStep }
  | {
      status: 'failed';
      action: PushDownAction;
      /** The write that failed. */
      step: PushDownStep;
      /**
       * True when an earlier step of the action already landed, so the debate shows as both pushed
       * down and ranked until a retry finishes the rest. Retry then runs only what's left.
       */
      partly: boolean;
      message: string;
    }
  | { status: 'done'; action: PushDownAction };

export const IDLE_PUSH_DOWN_STATE: PushDownState = { status: 'idle' };

export type StepResult = { ok: true } | { ok: false; message: string };

export type PushDownRunResult = { ok: true } | { ok: false; step: PushDownStep; partly: boolean; message: string };

export type PushDownStepRun = { step: PushDownStep; run: () => Promise<StepResult> };

/**
 * Runs the steps strictly one after another: each starts only once the one before it has
 * resolved, and nothing after a failed step runs. `null` steps (nothing to do) are skipped.
 */
export async function runInOrder(
  steps: ReadonlyArray<PushDownStepRun | null>,
  onStep?: (step: PushDownStep) => void
): Promise<PushDownRunResult> {
  let landed = 0;
  for (const step of steps) {
    if (!step) continue;
    onStep?.(step.step);
    const result = await settle(step.run);
    if (!result.ok) return { ok: false, step: step.step, partly: landed > 0, message: result.message };
    landed += 1;
  }
  return { ok: true };
}

async function settle(step: () => Promise<StepResult>): Promise<StepResult> {
  try {
    return await step();
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : 'Something went wrong.' };
  }
}

/** The ballot with the debate taken out, in order. */
export function ballotWithout(orderedEntityIds: readonly string[], debateId: string): string[] {
  return orderedEntityIds.filter(id => !ID.equals(id, debateId));
}

export function ballotHolds(orderedEntityIds: readonly string[], debateId: string): boolean {
  return orderedEntityIds.some(id => ID.equals(id, debateId));
}

/**
 * The space each vote on the member's ballot already points at, from its RANK_VOTES relations.
 *
 * Re-publishing a ballot without one debate re-sends every other vote (`ranks.update` replaces the
 * whole set), and each has to keep the space it was ranked in: a debate referenced under a second
 * space id becomes a second, half-strength row in `ranking_scores`.
 */
export function ballotVoteSpaceIds(
  relations: readonly Relation[],
  rankEntityId: string,
  authorSpaceId: string
): Map<string, string> {
  const spaces = new Map<string, string>();
  for (const relation of relations) {
    if (relation.isDeleted) continue;
    if (!ID.equals(relation.type.id, RANK_VOTES_RELATION_TYPE_ID)) continue;
    if (!ID.equals(relation.fromEntity.id, rankEntityId)) continue;
    if (!ID.equals(relation.spaceId, authorSpaceId)) continue;
    if (!relation.toSpaceId) continue;
    const key = ID.uuidToHex(relation.toEntity.id);
    if (!spaces.has(key)) spaces.set(key, relation.toSpaceId);
  }
  return spaces;
}

type SpaceScopedDebate = Parameters<typeof entityHomeSpaceId>[0];

/**
 * The debate's own space: where a new downvote is recorded.
 *
 * Every vote on a debate should use the same space as its ballot items (Patrick, 11 Nov): scores
 * are keyed by (block, entity, space). This is `entityHomeSpaceId` with two spaces taken out first:
 * the member's personal space and the Debates space, which only hosts the ranking block. A debate
 * that lives in neither comes back null, and nothing is sent.
 */
export function debateOwnSpaceId(
  debate: SpaceScopedDebate | null | undefined,
  personalSpaceId: string | null | undefined
): string | null {
  if (!debate) return null;
  const allowed = (spaceId: string) =>
    !ID.equals(spaceId, DEBATES_SPACE_ID) && !(personalSpaceId && ID.equals(spaceId, personalSpaceId));
  return entityHomeSpaceId({
    spaces: (debate.spaces ?? []).filter(allowed),
    values: (debate.values ?? []).filter(value => allowed(value.spaceId)),
  });
}

// ---------------------------------------------------------------------------------------------
// Copy. Before the cutover (GEO-3681) a downvote only moves a debate by its usual half point of
// quality, so nothing here may promise a feed effect until `BEST_DEBATES_RANKING_LIVE` says so.
// ---------------------------------------------------------------------------------------------

/** The one-time note, shown only once the ranking drives the feed. */
export const PUSH_DOWN_LIVE_NOTE = 'As a Debates member, your downvote pushes a debate down in the feed for everyone.';

/** The line under "Push it down" in the Rank it / Push it down choice (GEO-3678's dialog). */
export function pushDownChoiceDescription(rankingLive: boolean): string {
  return rankingLive ? `Low quality. ${PUSH_DOWN_LIVE_NOTE}` : 'Low quality. Records your downvote on this debate.';
}

/** Confirmation after a push-down: the live note the first time once the ranking is live. */
export function pushDownToastCopy({ rankingLive, noteSeen }: { rankingLive: boolean; noteSeen: boolean }): string {
  if (rankingLive && !noteSeen) return PUSH_DOWN_LIVE_NOTE;
  return 'Pushed down.';
}

export const PUSH_DOWN_UNDONE_COPY = 'Downvote removed.';

export const PUSH_DOWN_VOTE_FAILED_COPY = 'Your downvote didn’t go through. Try again.';
export const PUSH_DOWN_BALLOT_FAILED_COPY = 'Pushed down, but it’s still in your ranking. Retry to take it out.';
export const RANK_BALLOT_FAILED_COPY = 'Your ranking didn’t publish, so this debate is still pushed down. Try again.';
export const RANK_CLEAR_FAILED_COPY = 'Ranked, but your downvote is still on it. Retry to clear it.';
export const VOTE_CHECK_FAILED_COPY = 'Couldn’t check your vote on this debate. Try again.';
export const UNDO_FAILED_COPY = 'Your downvote is still there. Try again.';
/** `saveMySubmission` can't publish an empty ballot, so the last debate on it stays until another joins. */
export const PUSH_DOWN_LAST_BALLOT_ITEM_COPY =
  'Pushed down, but it’s the only debate in your ranking, and a ranking can’t be empty. Rank another debate, then retry.';

/** Session-scoped "already saw the note" flag; per-viewer convenience, safe when storage is blocked. */
const NOTE_SEEN_STORAGE_KEY = 'geo:best-debates:push-down-note-seen';

export function readPushDownNoteSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTE_SEEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPushDownNoteSeen(): void {
  try {
    window.localStorage.setItem(NOTE_SEEN_STORAGE_KEY, '1');
  } catch {
    /* Storage blocked: the note shows again next time, which is harmless. */
  }
}
