/** `/explore?modal=room-access&modalTarget=denied|ended` (GEO-2941). */
import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';

import type { DebateRoomAccess } from '../api';

export const ROOM_ACCESS_MODAL = DEEP_LINK_MODALS.roomAccess;

/** Where a turned-away viewer lands. */
const ROOM_ACCESS_PATHNAME = '/explore';

/**
 * Why the room would not open. A stale calendar link produces `ended`, and telling someone they
 * lack access to a debate that simply finished is a wrong answer.
 */
export type RoomAccessDenial = 'denied' | 'ended';

const DENIALS: Record<RoomAccessDenial, true> = { denied: true, ended: true };

/** An unrecognised target reads as `denied`: these URLs are written by hand and survive renames. */
export function roomAccessDenial(target: string | null): RoomAccessDenial | null {
  if (target === null) return null;
  return Object.hasOwn(DENIALS, target) ? (target as RoomAccessDenial) : 'denied';
}

export function toRoomAccess(denial: RoomAccessDenial, via?: string): string {
  return toModal({ modal: ROOM_ACCESS_MODAL, pathname: ROOM_ACCESS_PATHNAME, target: denial, via });
}

/**
 * Which refusals send the viewer away. `not_yet_open` is not one: they are on the list and the door
 * opens shortly, so the room says when rather than bouncing them to Explore.
 */
export function roomAccessDenialFor(access: DebateRoomAccess): RoomAccessDenial | null {
  switch (access.status) {
    case 'not_a_participant':
      return 'denied';
    case 'closed':
      return 'ended';
    default:
      return null;
  }
}

/**
 * A room that does not exist reads as ended rather than denied: the link came from somewhere, and a
 * calendar invite a month old is the common case.
 */
export function roomAccessDenialForStatus(status: number): RoomAccessDenial | null {
  return status === 404 ? 'ended' : null;
}
