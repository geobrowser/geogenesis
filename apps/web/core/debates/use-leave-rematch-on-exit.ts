import * as React from 'react';

import type { DebateRematchSession } from './api';

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
 * Three exits keep the session:
 * - **The hand-off into the converted debate.** `converted` is the one route away from here that
 *   the session was for.
 * - **A session already over, or already being left.** Nothing to end, and the Leave button's own
 *   request is in flight.
 * - **A room's session**, recognisable by having no browsing deadline. The room ends it when the
 *   room closes, and GEO-2941 forbids ending a conversation two people are still having.
 *
 * `pagehide` is deliberately not handled. It fires on a reload as well as a close, and nothing
 * available at that moment tells them apart, so leaving there would end the session whenever
 * someone refreshed. A closed tab is caught by the offline sweep once its heartbeat stops.
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

    return () => {
      // Deferred a tick so an immediate remount of the same session can cancel it.
      const timer = window.setTimeout(() => {
        pendingExitLeaves.delete(sessionId);
        const { session: current, leave: leaveSession, exiting: isExiting } = latest.current;
        if (!current || current.id !== sessionId) return;
        if (current.status !== 'browsing' && current.status !== 'request_pending') return;
        if (current.browsing_expires_at === null) return;
        if (isExiting()) return;
        leaveSession();
      }, 0);
      pendingExitLeaves.set(sessionId, timer);
    };
  }, [sessionId]);
}
