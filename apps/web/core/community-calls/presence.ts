import { LIVE_MEETING_GRACE_MINUTES } from './constants';
import type { EventPhase, EventTiming } from './event-timing';

/** What the page needs from the live-participants endpoint. */
export type CallPresence = {
  /** Editors and members currently in the room, in join order. */
  names: string[];
  /** Curator-backend's own verdict that the occurrence is over. */
  isEnded: boolean;
};

/**
 * Whether presence is worth asking about at all.
 *
 * The scheduled window plus the same grace period the agenda editor stays unlocked for, so a call
 * that runs past its slot is still visibly running. Outside it the endpoint is not polled: a call
 * from May is not coming back, and this page would otherwise sit on a 15-second timer forever.
 */
export function shouldAskPresence(timing: EventTiming | null, nowMs: number): boolean {
  if (!timing) return false;
  const graceMs = LIVE_MEETING_GRACE_MINUTES * 60 * 1000;
  const end = (timing.endMs ?? timing.startMs) + graceMs;
  return nowMs >= timing.startMs && nowMs <= end;
}

/**
 * The clock proposes, presence disposes.
 *
 * Deriving "live" from the schedule alone is wrong twice: a call that ends twenty minutes early
 * keeps offering to join for the rest of its slot, and a call nobody joined claims to be running
 * for its full hour. Both promise something the page never checked.
 *
 * So `isEnded` can close a call the clock still thinks is open, and people in the room can hold one
 * open past its scheduled end. What presence deliberately cannot do is open a call *early* — before
 * the start time nothing is polled, because a room that accepts an early joiner is not the same
 * claim as a call being under way.
 *
 * `presence` is null whenever the endpoint has not answered — not yet, or at all. That falls back
 * to the clock rather than withholding the join button: being briefly optimistic about a live call
 * is a smaller failure than hiding one that is running.
 */
export function applyPresence(clockPhase: EventPhase, presence: CallPresence | null): EventPhase {
  if (!presence) return clockPhase;
  if (clockPhase === 'live' && presence.isEnded) return 'past';
  if (clockPhase === 'past' && !presence.isEnded && presence.names.length > 0) return 'live';
  return clockPhase;
}

/** How many names are spelled out before the rest become a count. */
const NAMED_LIMIT = 2;

/**
 * Who is in the room, as a sentence.
 *
 * Names rather than a bare count: "Bri and Sam are here" is a reason to join, "5 participants" is a
 * statistic. Past the second name the list stops being readable at a glance, so the tail collapses.
 */
export function formatPresence(names: string[]): string | null {
  const present = names.filter(name => name.trim().length > 0);
  if (present.length === 0) return null;
  if (present.length === 1) return `${present[0]} is here`;
  if (present.length === 2) return `${present[0]} and ${present[1]} are here`;

  const named = present.slice(0, NAMED_LIMIT);
  const others = present.length - NAMED_LIMIT;
  return `${named.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'} are here`;
}
