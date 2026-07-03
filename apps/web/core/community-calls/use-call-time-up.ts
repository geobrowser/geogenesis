import * as React from 'react';

import { Room } from 'livekit-client';

/**
 * Disconnects the room and hands off to `onLeave` when the call-end countdown
 * (`CallEndTimer`) reaches zero. Shared so the forced-timeout path and the
 * manual-leave path converge on the same cleanup.
 */
export function useCallTimeUp(room: Room, onLeave: () => void) {
  return React.useCallback(() => {
    room.disconnect();
    onLeave();
  }, [room, onLeave]);
}
