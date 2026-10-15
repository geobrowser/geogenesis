import * as React from 'react';

import type { DebateRematchSession } from '../api';
import { DEBATE_TAB_CLAIM_TTL_MS, debateRematchClaimKey, findOtherOpenDebateTab } from '../debate-tab-claims';
import { useLeaveDebateRematch } from '../hooks';
import { isPickerSessionOpen } from '../use-leave-rematch-on-exit';

/**
 * How long no tab may hold the picker before the lobby takes it as left: as long as a debate tab may
 * go quiet and still count as open, which comfortably covers a reload.
 */
const PICKER_GONE_AFTER_MS = DEBATE_TAB_CLAIM_TTL_MS;

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
 * open in another tab is left alone: the viewer may be choosing there right now. That tab can close
 * later without a word, so the check runs again on every activity read until it leaves.
 *
 * A picker tab that is reloading holds no lock until its new page mounts, which here waits for
 * hydration, so one read without a lock proves nothing. It leaves only once reads at least
 * {@link PICKER_GONE_AFTER_MS} apart have found no picker tab, with none found in between. A check
 * that cannot answer (no Web Locks, or the query fails) counts as a picker open: unlike the
 * picker's own exit, joining the room does not show the picker was left.
 */
export function useEndPickerLeftBehind({
  joined,
  session,
  checkedAt,
  leave,
}: {
  /** In the room now: joined, not stepped out. */
  joined: boolean;
  /** The viewer's own debate-again session, from their debate activity. */
  session: DebateRematchSession | null;
  /** When that activity was last read: each read looks for the picker tab again. */
  checkedAt: number;
  leave: () => void;
}) {
  const leaveRef = React.useRef(leave);
  leaveRef.current = leave;
  // One leave per session: a refused leave must not repeat on every activity poll.
  const triedRef = React.useRef<string | null>(null);
  // When reads began finding no picker tab for this session, while the viewer stayed in the room.
  const goneSinceRef = React.useRef<{ sessionId: string; at: number } | null>(null);

  const sessionId = session?.id ?? null;
  const open = session !== null && isPickerSessionOpen(session);

  React.useEffect(() => {
    if (!joined || !open || sessionId === null) {
      goneSinceRef.current = null;
      return;
    }
    if (triedRef.current === sessionId) return;
    let cancelled = false;
    void findOtherOpenDebateTab(debateRematchClaimKey(sessionId)).then(pickerOpen => {
      if (cancelled) return;
      if (pickerOpen !== false) {
        goneSinceRef.current = null;
        return;
      }
      const now = Date.now();
      const goneSince = goneSinceRef.current;
      if (goneSince?.sessionId !== sessionId) {
        goneSinceRef.current = { sessionId, at: now };
        return;
      }
      if (now - goneSince.at < PICKER_GONE_AFTER_MS) return;
      triedRef.current = sessionId;
      leaveRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [joined, open, sessionId, checkedAt]);
}

/** {@link useEndPickerLeftBehind} on the lobby room, mounted only while the viewer has a session. */
export function EndPickerLeftBehind({
  joined,
  session,
  checkedAt,
}: {
  joined: boolean;
  session: DebateRematchSession;
  checkedAt: number;
}) {
  const leaveRematch = useLeaveDebateRematch(session.id);
  useEndPickerLeftBehind({ joined, session, checkedAt, leave: () => leaveRematch.mutate() });
  return null;
}
