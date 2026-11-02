import type { DebateRoomNudge, DebateRoomParticipantPresence, DebateRoomView } from '../api';
import { type DebateRoomPresenceState, noticeFrom, sameId } from './room-presence';

/**
 * What the debater waiting in a scheduled room is told about the other one (GEO-3428). Pure, so the
 * rules are tested here and the card only draws them.
 */

/** One line of the room's timeline, oldest first. */
export type RoomWaitingEntry =
  | { kind: 'room_open'; at: string }
  | { kind: 'opponent_waiting'; at: string }
  | { kind: 'nudged'; at: string; channel: DebateRoomNudge['channel'] }
  | { kind: 'running_late'; at: string };

/**
 * The reminders Geo sent the other debater, the viewer's nudges to them, and their Running late, in
 * the order they happened. Only what concerns the two of them: someone else's reminders, or a nudge
 * the other sent the viewer, are not this viewer's timeline.
 */
export function roomWaitingTimeline(
  room: DebateRoomView,
  opponentUserId: string,
  viewerId: string
): RoomWaitingEntry[] {
  const reminders: RoomWaitingEntry[] = (room.reminders ?? [])
    .filter(reminder => sameId(reminder.user_id, opponentUserId))
    .map(reminder => ({ kind: reminder.kind, at: reminder.at }));
  const nudges: RoomWaitingEntry[] = (room.nudges ?? [])
    .filter(nudge => sameId(nudge.from_user_id, viewerId) && sameId(nudge.to_user_id, opponentUserId))
    .map(nudge => ({ kind: 'nudged', at: nudge.at, channel: nudge.channel }));
  const late = noticeFrom(room.notices, opponentUserId, 'running_late');
  const said: RoomWaitingEntry[] = late ? [{ kind: 'running_late', at: late.at }] : [];
  return [...reminders, ...nudges, ...said].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** The other debater's presence, or `null` from a geo-chat that predates it. */
export function opponentPresence(room: DebateRoomView, opponentUserId: string): DebateRoomParticipantPresence | null {
  return (room.presence ?? []).find(entry => sameId(entry.user_id, opponentUserId)) ?? null;
}

/** Whole minutes from `iso` to `now`, never negative: a skewed clock reads as "just now". */
export function minutesSince(iso: string, now: number): number | null {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now - at) / 60_000));
}

/**
 * The card is for someone sitting in the room after the start with the other person not in it:
 * waiting, waiting while they are in another debate, after they came and went, and after the grace.
 * Not before the start (nobody is late yet) and not once they are here.
 */
export function showsWaitingStatus(state: DebateRoomPresenceState | null | undefined): boolean {
  return state === 'waiting' || state === 'waiting_elsewhere' || state === 'left' || state === 'no_show';
}

/**
 * What the Nudge button does now: `ready` to press; `nudged` while it waits out the 15 minutes after
 * one of the viewer's, or for good once both are used; `not_yet` before the first is allowed (the
 * start, which the room's poll can reach a few seconds before the clock does); and `hidden` from a
 * geo-chat that predates nudges. The card never draws it while the other debater is running late.
 *
 * `now` is the server's clock, as `viewer_next_nudge_at` is. `answered` is the nudge endpoint's own
 * `next_nudge_at` from a press this visit, which is ahead of the room until the room refetches.
 */
export type NudgeButtonState = 'ready' | 'nudged' | 'not_yet' | 'hidden';

export function nudgeButtonState(
  room: DebateRoomView,
  viewerId: string,
  now: number,
  answered?: { next_nudge_at: string | null }
): NudgeButtonState {
  if (room.viewer_next_nudge_at === undefined) return 'hidden';
  const sent = answered !== undefined || (room.nudges ?? []).some(nudge => sameId(nudge.from_user_id, viewerId));
  const nexts = [room.viewer_next_nudge_at, ...(answered ? [answered.next_nudge_at] : [])];
  // `null` from either is both used; otherwise the later of the two is the one that holds.
  if (nexts.includes(null)) return 'nudged';
  const next = Math.max(...nexts.map(at => new Date(at as string).getTime()).filter(at => !Number.isNaN(at)));
  if (!Number.isFinite(next) || now >= next) return 'ready';
  return sent ? 'nudged' : 'not_yet';
}
