import type { Debate, DebateActivity } from './api';

/** A debate in one of these states is over; geo-chat keeps reporting it for a while afterwards. */
const FINISHED_DEBATE_STATUSES: Debate['status'][] = ['complete', 'cancelled'];

type ActivityLike = Pick<DebateActivity, 'debate'> & Partial<Pick<DebateActivity, 'rematch'>>;

/**
 * `activity.debate` is the last debate the viewer was in, not necessarily one they are still in —
 * the server keeps reporting it after it completes. Reading the field raw therefore leaves the
 * viewer permanently "in a debate": every Debate button greys out and matchmaking refuses to start
 * anything new, with no way to clear it.
 */
export function activeDebate(activity: ActivityLike | null | undefined): Debate | null {
  const debate = activity?.debate ?? null;
  if (!debate) return null;
  if (FINISHED_DEBATE_STATUSES.includes(debate.status)) return null;
  // A cancelled recording ends the debate for both sides before the status catches up: nothing can
  // be published from it and the room bounces anyone who opens it straight back out. Counting it
  // kept every Debate control greyed out and stranded the pair with no way to start anything new.
  if (debate.recording_cancelled_at) return null;
  return debate;
}

/**
 * The reported debate's id when there is nothing left to enter: it finished, or its recording was
 * cancelled. Callers use it to refuse to navigate into a room that hides itself and returns whoever
 * opens it — see `activeDebate` for why such a debate is not "active".
 *
 * Deliberately the exact inverse of `activeDebate` rather than its own list of conditions. GEO-2600
 * was a caller that checked only the cancelled recording and so still routed into a `complete`
 * room, which bounced the viewer straight back out and re-armed the push that sent them.
 */
export function unenterableDebateId(activity: ActivityLike | null | undefined): string | null {
  const debate = activity?.debate ?? null;
  if (!debate) return null;
  return activeDebate(activity) ? null : debate.id;
}

/**
 * Whether the viewer is tied up in something that rules out taking on another debate. `activity
 * .match` is deliberately not consulted: GEO-2514 deleted auto-pairing, so it is permanently null.
 */
export function hasActiveDebateFlow(activity: ActivityLike | null | undefined): boolean {
  return Boolean(activeDebate(activity) || activity?.rematch);
}
