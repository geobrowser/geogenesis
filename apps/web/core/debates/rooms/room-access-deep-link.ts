/** `/explore?modal=room-access&modalTarget=denied|ended` (GEO-2941). Access is only knowable client-side. */
import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';

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
 * `403` is the access list, `404` a room that has gone. Anything else is not a refusal, and `null`
 * keeps the room retrying rather than quietly sending the viewer to Explore.
 */
export function roomAccessDenialForStatus(status: number): RoomAccessDenial | null {
  if (status === 403) return 'denied';
  if (status === 404) return 'ended';
  return null;
}
