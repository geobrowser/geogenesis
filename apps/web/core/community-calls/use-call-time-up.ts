import * as React from 'react';

/**
 * Hands off to `onLeave` when the call-end countdown (`CallEndTimer`) reaches
 * zero. Shared so the forced-timeout path and the manual-leave path converge
 * on the same cleanup — `onLeave` itself disconnects the room.
 */
export function useCallTimeUp(onLeave: () => void) {
  return React.useCallback(() => {
    onLeave();
  }, [onLeave]);
}
