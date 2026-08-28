/** Routes whose own full-screen chrome would sit under the assistant's floating launcher. */

const FULLSCREEN_CHILD_ROUTE_SUFFIXES = ['/ranking-compose'] as const;

// The claim-exploration picker is its own full-screen overlay, and it parks a voice dock in the
// bottom-right corner — exactly where the assistant's launcher floats.
const FULLSCREEN_CHILD_ROUTE_PATTERNS = [/\/debates\/rematches\/[^/]+$/] as const;

// The debates browse feed is full-bleed only below `md`, where its interaction bar becomes a
// horizontal row under the videos and puts share directly beneath the launcher. Wider than that
// the bar is a vertical rail beside the column and nothing overlaps — so unlike the routes above,
// this one is hidden by width as well as by path rather than everywhere.
const COMPACT_FULLSCREEN_ROUTE_PATTERNS = [/\/space\/[^/]+\/debates$/] as const;

function isFullscreenChildRoute(pathname: string): boolean {
  return (
    FULLSCREEN_CHILD_ROUTE_SUFFIXES.some(suffix => pathname.endsWith(suffix)) ||
    FULLSCREEN_CHILD_ROUTE_PATTERNS.some(pattern => pattern.test(pathname))
  );
}

function isCompactFullscreenRoute(pathname: string): boolean {
  return COMPACT_FULLSCREEN_ROUTE_PATTERNS.some(pattern => pattern.test(pathname));
}

/**
 * Whether the assistant should keep out of the way entirely — no launcher, no panel, no hotkey.
 *
 * `isCompactLayout` is the project's `md:` breakpoint (at most 767px), not the app-wide mobile
 * threshold: between the two the debates feed is still laid out as desktop, so hiding there would
 * take the assistant away from a screen it does not obstruct.
 */
export function shouldHideAssistant(pathname: string, isCompactLayout: boolean): boolean {
  return isFullscreenChildRoute(pathname) || (isCompactLayout && isCompactFullscreenRoute(pathname));
}
