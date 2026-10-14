/**
 * The claims area pins its tab row, and each tab pins its own controls (Explore's search, a claim
 * list's themes) right under it. The tab row reports its height in this variable on the claims
 * area, so the offsets below follow it if it wraps or changes size.
 *
 * Desktop: the claims column scrolls on its own, and sticky offsets count from inside its `py-5`, so
 * `-1.25rem` is its top edge. Phones: the page scrolls under the `h-11` navbar.
 */
export const LOBBY_CLAIMS_TABS_HEIGHT_VAR = '--lobby-claims-tabs-h';

/** The tab row itself. */
export const LOBBY_CLAIMS_TABS_TOP_CLASS = '-top-5 md:top-11';

/** A tab's own pinned controls, right under the tab row. */
export const LOBBY_CLAIMS_CONTROLS_TOP_CLASS =
  'top-[calc(var(--lobby-claims-tabs-h,2rem)-1.25rem)] md:top-[calc(var(--lobby-claims-tabs-h,2rem)+2.75rem)]';
