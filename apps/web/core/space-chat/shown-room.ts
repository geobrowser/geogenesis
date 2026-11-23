import { dashlessId } from '~/core/debates/api';

/**
 * The channel open in a visible tab, which `space.channel_activity` leaves uncounted (its messages
 * arrive live). Read only outside render, by the gateway.
 */
let shownRoomId: string | null = null;

export function getShownChatRoom() {
  return shownRoomId;
}

/** Marks `roomId` shown; the returned function clears it, unless another room took over since. */
export function showChatRoom(roomId: string) {
  const id = dashlessId(roomId);
  shownRoomId = id;
  return () => {
    if (shownRoomId === id) shownRoomId = null;
  };
}
