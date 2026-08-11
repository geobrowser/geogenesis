import type { Debate, DebateActivity, DebateMatch } from './api';

/** A debate in one of these states is over; geo-chat keeps reporting it for a while afterwards. */
const FINISHED_DEBATE_STATUSES: Debate['status'][] = ['complete', 'cancelled'];
/** Likewise a match nobody took up. */
const FINISHED_MATCH_STATUSES: DebateMatch['status'][] = ['declined', 'expired'];

type ActivityLike = Pick<DebateActivity, 'match' | 'debate'> & Partial<Pick<DebateActivity, 'rematch'>>;

/**
 * `activity.debate` and `activity.match` are the last ones the viewer was in, not necessarily ones
 * they are still in — the server keeps reporting a debate after it completes and a match after it
 * is declined or expires. Reading either field raw therefore leaves the viewer permanently "in a
 * debate": every Debate button greys out and matchmaking refuses to start anything new, with no way
 * to clear it.
 */
export function activeDebate(activity: ActivityLike | null | undefined): Debate | null {
  const debate = activity?.debate ?? null;
  return debate && !FINISHED_DEBATE_STATUSES.includes(debate.status) ? debate : null;
}

export function activeMatch(activity: ActivityLike | null | undefined): DebateMatch | null {
  const match = activity?.match ?? null;
  return match && !FINISHED_MATCH_STATUSES.includes(match.status) ? match : null;
}

/** Whether the viewer is tied up in something that rules out taking on another debate. */
export function hasActiveDebateFlow(activity: ActivityLike | null | undefined): boolean {
  return Boolean(activeMatch(activity) || activeDebate(activity) || activity?.rematch);
}
