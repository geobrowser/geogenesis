/** Routes and surfaces whose own chrome would sit under the assistant's floating launcher. */

const FULLSCREEN_CHILD_ROUTE_SUFFIXES = ['/ranking-compose'] as const;

// The claim-exploration picker is its own full-screen overlay, and it parks a voice dock in the
// bottom-right corner — exactly where the assistant's launcher floats.
const FULLSCREEN_CHILD_ROUTE_PATTERNS = [/\/debates\/rematches\/[^/]+$/] as const;

function isFullscreenChildRoute(pathname: string): boolean {
  return (
    FULLSCREEN_CHILD_ROUTE_SUFFIXES.some(suffix => pathname.endsWith(suffix)) ||
    FULLSCREEN_CHILD_ROUTE_PATTERNS.some(pattern => pattern.test(pathname))
  );
}

/**
 * Whether the assistant should keep out of the way entirely — no launcher, no panel, no hotkey.
 *
 * `hasCompactTakeover` is the debates feed filling the viewport at a width where its interaction
 * bar runs horizontally under the videos, putting share directly beneath the launcher. It is not
 * a route test on purpose: the same feed renders both at `/space/{id}/debates` and on a Debate
 * entity page at `/space/{id}/{entityId}`, which is what a shared link opens — and on that route
 * the path alone cannot tell a Debate from any other entity. The feed already announces itself
 * through `debateFullscreenActiveAtom` for the app shell, so that is the honest signal to read.
 */
export function shouldHideAssistant(pathname: string, hasCompactTakeover: boolean): boolean {
  return isFullscreenChildRoute(pathname) || hasCompactTakeover;
}
