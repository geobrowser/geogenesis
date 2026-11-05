'use client';

import * as React from 'react';

/**
 * The call's Chat tab dot: set by a message arriving while the chat isn't showing, cleared once it
 * shows. `showing` is always true where the aside sits beside the people.
 */
export function useChatUnreadMark(showing: boolean) {
  const [unread, setUnread] = React.useState(false);
  const showingRef = React.useRef(showing);
  showingRef.current = showing;

  React.useEffect(() => {
    if (showing) setUnread(false);
  }, [showing]);

  const onArrival = React.useCallback(() => {
    if (!showingRef.current) setUnread(true);
  }, []);

  return { mark: unread && !showing, onArrival };
}
