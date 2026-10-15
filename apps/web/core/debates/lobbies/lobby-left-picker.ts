import * as React from 'react';

import type { DebateRematchSession } from '../api';
import { debateRematchClaimKey, hasOtherOpenDebateTab } from '../debate-tab-claims';
import { useLeaveDebateRematch } from '../hooks';
import { isPickerSessionOpen } from '../use-leave-rematch-on-exit';

/**
 * Ends the viewer's debate-again session once they are back in the lobby room with no picker open
 * (GEO-3338).
 *
 * The picker leaves its session on unmount (`useLeaveRematchOnExit`), but an unmount never runs when
 * the document goes away: browser Back across a full page load, or a closed tab. geo-chat's offline
 * sweep cannot catch it either, because any open Geo tab, this lobby included, keeps the viewer
 * online. The session then holds them "in a debate" for up to its hour-long browsing window, so the
 * room lists them in a "Picking a claim" pair instead of as a speaker, while they talk on voice.
 *
 * Joined to the room means they chose the room, so an open picker that no tab of theirs holds is one
 * they walked out of. It ends exactly the sessions the picker's own exit would, and a picker still
 * open in another tab is left alone: the viewer may be choosing there right now.
 */
export function useEndPickerLeftBehind({
  joined,
  session,
  leave,
}: {
  /** In the room now: joined, not stepped out. */
  joined: boolean;
  /** The viewer's own debate-again session, from their debate activity. */
  session: DebateRematchSession | null;
  leave: () => void;
}) {
  const leaveRef = React.useRef(leave);
  leaveRef.current = leave;
  // Once per session: a refused leave must not loop on every activity poll.
  const triedRef = React.useRef<string | null>(null);

  const sessionId = session?.id ?? null;
  const open = session !== null && isPickerSessionOpen(session);

  React.useEffect(() => {
    if (!joined || !open || sessionId === null || triedRef.current === sessionId) return;
    let cancelled = false;
    void hasOtherOpenDebateTab(debateRematchClaimKey(sessionId)).then(pickerOpen => {
      if (cancelled || pickerOpen) return;
      triedRef.current = sessionId;
      leaveRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [joined, open, sessionId]);
}

/** {@link useEndPickerLeftBehind} on the lobby room, mounted only while the viewer has a session. */
export function EndPickerLeftBehind({ joined, session }: { joined: boolean; session: DebateRematchSession }) {
  const leaveRematch = useLeaveDebateRematch(session.id);
  useEndPickerLeftBehind({ joined, session, leave: () => leaveRematch.mutate() });
  return null;
}
