import { CALL_END_TIMER_DELAY_MINUTES, LIVE_MEETING_GRACE_MINUTES } from './constants';

const MINUTE_MS = 60 * 1000;

/**
 * A call is never ended while this many people are still connected — until the hard cap.
 *
 * GEO-2584: 25 days of attributed drop telemetry showed the scheduled cutoff was the only
 * thing actually removing anyone from a call. It ended a call people were still talking in,
 * 30 minutes after its scheduled end, on the clock alone.
 */
export const CALL_KEEPALIVE_QUORUM = 2;

/**
 * Ceiling on how long a call can keep itself alive by being busy, measured from its scheduled
 * start. A room with two forgotten tabs in it still closes.
 *
 * Never earlier than the ordinary cutoff — a call scheduled longer than this still gets its
 * full slot plus the usual grace — and an editor's explicit extension (`useCallExtension`)
 * moves it along with everything else.
 */
export const CALL_HARD_CAP_MS = 2 * 60 * MINUTE_MS;

/**
 * Once the scheduled cutoff has passed, how long the room may sit below quorum before it
 * ends. Long enough that a participant's reconnect blip (LiveKit keeps a dropping remote in
 * the list meanwhile, but the *local* list can briefly read 1 while this client reconnects)
 * does not end the call for the person left behind; short enough that the last person in
 * the room gets a visible countdown rather than an abandoned room.
 */
export const BELOW_QUORUM_GRACE_MS = 60 * 1000;

/** How long before the deadline the countdown banner appears. */
export const CALL_END_COUNTDOWN_MS = (LIVE_MEETING_GRACE_MINUTES - CALL_END_TIMER_DELAY_MINUTES) * MINUTE_MS;

export type CallDeadlineInput = {
  /** The occurrence's scheduled start (epoch ms). */
  startMs: number;
  /** The occurrence's scheduled end (epoch ms), without any extension. */
  endMs: number;
  /** Extension the room has agreed on (see `useCallExtension`). */
  extensionMs: number;
  /** People connected, as this client sees them — the local participant included, agents excluded. */
  connectedCount: number;
  /**
   * When this client first saw the room below quorum, if it is below quorum now. Required
   * whenever `connectedCount` is under {@link CALL_KEEPALIVE_QUORUM}.
   */
  belowQuorumSinceMs: number | null;
};

export type CallDeadline = {
  /** When this client disconnects itself, unless the inputs change first. */
  deadlineMs: number;
  /** Why the call ends at `deadlineMs` — drives the banner copy. */
  reason: 'scheduled' | 'alone' | 'cap';
};

/** The old, clock-only cutoff: scheduled end plus grace plus any agreed extension. */
export function scheduledCutoffMs({ endMs, extensionMs }: Pick<CallDeadlineInput, 'endMs' | 'extensionMs'>): number {
  return endMs + LIVE_MEETING_GRACE_MINUTES * MINUTE_MS + extensionMs;
}

/** The instant the call ends no matter who is still in it. */
export function hardCapMs({
  startMs,
  endMs,
  extensionMs,
}: Pick<CallDeadlineInput, 'startMs' | 'endMs' | 'extensionMs'>): number {
  return Math.max(startMs + CALL_HARD_CAP_MS, endMs + LIVE_MEETING_GRACE_MINUTES * MINUTE_MS) + extensionMs;
}

/**
 * When a connected client should end its call.
 *
 * - With {@link CALL_KEEPALIVE_QUORUM} or more connected, the call runs to the hard cap.
 * - Below quorum, it ends at the scheduled cutoff as it always did — or, if the room only
 *   fell below quorum after that, {@link BELOW_QUORUM_GRACE_MS} after it did.
 * - Nothing runs past the hard cap.
 *
 * Every client evaluates this for itself (as the cutoff always was), so the counts it is fed
 * only need to agree roughly across the room: the lone survivor is the one it ends.
 */
export function callDeadline(input: CallDeadlineInput): CallDeadline {
  const cap = hardCapMs(input);
  if (input.connectedCount >= CALL_KEEPALIVE_QUORUM) return { deadlineMs: cap, reason: 'cap' };

  // Never later than the cap: the cap is built from the same end, grace and extension.
  const scheduled = scheduledCutoffMs(input);
  if (input.belowQuorumSinceMs === null) return { deadlineMs: scheduled, reason: 'scheduled' };

  const alone = input.belowQuorumSinceMs + BELOW_QUORUM_GRACE_MS;
  if (alone <= scheduled) return { deadlineMs: scheduled, reason: 'scheduled' };
  if (alone >= cap) return { deadlineMs: cap, reason: 'cap' };
  return { deadlineMs: alone, reason: 'alone' };
}
