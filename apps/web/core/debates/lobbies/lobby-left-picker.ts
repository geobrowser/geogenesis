import * as React from 'react';

import type { DebateRematchSession } from '../api';
import { debateRematchClaimKey, hasOtherOpenDebateTab } from '../debate-tab-claims';
import { useLeaveDebateRematch } from '../hooks';

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
 * Joined to the room means they chose the room, so a picker nobody has open is one they walked out
 * of. Kept exactly where `useLeaveRematchOnExit` keeps one:
 * - **Not browsing**: a converted, ended or still-deciding session is not a picker left open.
 * - **A room's session**, with no browsing deadline: the room ends it when it closes (GEO-2941).
 * - **A picker tab still open** in this browser: the viewer may be choosing there right now.
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
  leave: (sessionId: string) => void;
}) {
  const leaveRef = React.useRef(leave);
  leaveRef.current = leave;
  // Once per session: a refused leave must not loop on every activity poll.
  const triedRef = React.useRef<string | null>(null);

  const sessionId = session?.id ?? null;
  const open =
    session !== null &&
    (session.status === 'browsing' || session.status === 'request_pending') &&
    session.browsing_expires_at !== null;

  React.useEffect(() => {
    if (!joined || !open || sessionId === null || triedRef.current === sessionId) return;
    let cancelled = false;
    void hasOtherOpenDebateTab(debateRematchClaimKey(sessionId)).then(pickerOpen => {
      if (cancelled || pickerOpen || triedRef.current === sessionId) return;
      triedRef.current = sessionId;
      leaveRef.current(sessionId);
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
