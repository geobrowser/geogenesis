import * as React from 'react';

import type { DebateRematchSession } from './api';
import { debateRematchClaimKey, debateTabId, hasOtherOpenDebateTab, holdOpenDebateTab } from './debate-tab-claims';

/**
 * Leaving timers not yet fired, by session id.
 *
 * Module scope rather than a ref because the remount that must cancel one is a new component
 * instance: under React's development double-invoke the page unmounts and mounts again in the same
 * tick, and a ref would belong to the instance that already went away.
 */
const pendingExitLeaves = new Map<string, number>();

/**
 * Ends a debate-again session when the picker unmounts while the session is still open (GEO-3024).
 *
 * The Leave button used to be the only exit that ended it. Browser back, a link, the nav, anything
 * else that navigated away left both people holding `active_rematch_session_id`, so each read as
 * "already in a debate" to the other. Neither sweep caught it quickly: the offline one waits for a
 * heartbeat that any open Geo tab keeps fresh, and the overrun one waits out the full browsing
 * window.
 *
 * Four exits keep the session:
 * - **The hand-off into the converted debate.** `converted` is the one route away from here that
 *   the session was for.
 * - **A session already over, or already being left.** Nothing to end, and the Leave button's own
 *   request is in flight.
 * - **A room's session**, recognisable by having no browsing deadline. The room ends it when the
 *   room closes, and GEO-2941 forbids ending a conversation two people are still having.
 * - **Another of the viewer's tabs still has this picker open.** Leaving ends the session for both
 *   people, so a stray second tab navigating away must not take the session from under the tab
 *   the viewer is still choosing in. Each picker tab holds a Web Lock named for itself while it is
 *   mounted (`holdOpenDebateTab`); the browser drops it when the tab closes, so the last tab out
 *   still leaves at once. Without Web Locks every exit leaves, as before.
 *
 * `pagehide` is deliberately not handled. It fires on a reload as well as a close, and nothing
 * available at that moment tells them apart, so leaving there would end the session whenever
 * someone refreshed. A closed tab sends nothing; if it was the last one, the session ends when
 * the offline or overrun sweep reaches it.
 */
export function useLeaveRematchOnExit({
  sessionId,
  session,
  leave,
  exiting,
}: {
  sessionId: string;
  session: DebateRematchSession | null;
  leave: () => void;
  /** True once this page has started a departure of its own that already accounts for the session. */
  exiting: () => boolean;
}) {
  // Read at unmount, not captured at mount: by then the session has usually moved on from the
  // state it was first fetched in.
  const latest = React.useRef({ session, leave, exiting });
  latest.current = { session, leave, exiting };

  React.useEffect(() => {
    const pending = pendingExitLeaves.get(sessionId);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      pendingExitLeaves.delete(sessionId);
    }

    const tabKey = debateRematchClaimKey(sessionId);
    const tabId = debateTabId();
    const releaseOpenTab = holdOpenDebateTab(tabKey, tabId);

    return () => {
      // Released now, not in the timer: a remount that cancels the timer holds its own.
      releaseOpenTab();
      // Deferred a tick so an immediate remount of the same session can cancel it.
      const timer = window.setTimeout(() => {
        pendingExitLeaves.delete(sessionId);
        const { session: current, leave: leaveSession, exiting: isExiting } = latest.current;
        if (!current || current.id !== sessionId) return;
        if (current.status !== 'browsing' && current.status !== 'request_pending') return;
        if (current.browsing_expires_at === null) return;
        if (isExiting()) return;
        void hasOtherOpenDebateTab(tabKey, tabId).then(otherTabOpen => {
          if (!otherTabOpen) leaveSession();
        });
      }, 0);
      pendingExitLeaves.set(sessionId, timer);
    };
  }, [sessionId]);
}
