'use client';

/**
 * Where the viewer was before a debate took over the screen.
 *
 * Ending a debate used to hand people `/space/{debateSpaceId}/debates` — the debate's *own* space,
 * which for a claim held in someone's personal space is a page that does not meaningfully exist. The
 * ordinary exit tried `router.back()` first, which is right about as often as the entry behind the
 * room happens to be where they came from: not reliably, and never at all for a debate opened in a
 * fresh tab.
 *
 * So remember it instead. `DebateCoordinator` is mounted app-wide and sees every navigation, which
 * makes it the one place that can watch this without every entry point into a room having to
 * cooperate — accepting a request, the ready prompt, the rejoin bar, and a pasted link all end up
 * here for free.
 *
 * Session-scoped on purpose: "the screen I was on" is a fact about this tab, and it has to survive a
 * reload inside the room, which a module variable would not.
 */
const RETURN_PATH_STORAGE_KEY = 'geo.debates.return-path';

/**
 * A debate room, its recording sub-route, and the rematch picker. These are places a debate *sends*
 * you, so none of them can be the place you came from — recording one would return you into the
 * flow you just left. The hub at `/space/{id}/debates` is deliberately not one of them: it has no
 * trailing segment, and starting from it is ordinary.
 */
const DEBATE_SURFACE_PATH = /\/debates\/[^/]+/;

export function isDebateSurfacePath(pathname: string) {
  return DEBATE_SURFACE_PATH.test(pathname);
}

export function rememberDebateReturnPath(pathname: string) {
  if (!pathname || isDebateSurfacePath(pathname)) return;
  try {
    window.sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, pathname);
  } catch {
    // Private mode or a quota wall. Losing the way back costs a fallback destination; throwing here
    // would cost the navigation that was already under way.
  }
}

export function debateReturnPath(): string | null {
  try {
    const stored = window.sessionStorage.getItem(RETURN_PATH_STORAGE_KEY);
    // A stored debate path would mean returning into the room being left, so refuse it even though
    // nothing should be able to write one.
    return stored && !isDebateSurfacePath(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function clearDebateReturnPath() {
  try {
    window.sessionStorage.removeItem(RETURN_PATH_STORAGE_KEY);
  } catch {
    // Nothing to do — the next debate overwrites it anyway.
  }
}
