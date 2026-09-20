/**
 * The tab bar's link target.
 *
 * Its own module, with no `'use client'`, because the space layout is a Server Component and reads
 * {@link SPACE_TABS_ANCHOR} to write a DOM `id`. Every export of a client module is a client
 * reference on the server, so when this lived in `space-tabs.tsx` the layout rendered
 * `{"id":"$56"}` into the flight payload instead of the string — the id only existed once hydration
 * resolved the reference, which is no use to a browser looking for a fragment on a cold load.
 *
 * The id and the href that points at it belong together: they are one contract with two halves, and
 * the point of naming them once is that the two cannot drift.
 */

/** The id on the element wrapping the tab bar — see the space layout. */
export const SPACE_TABS_ANCHOR = 'space-tabs';

/**
 * `href` with the fragment that lands the reader on the tab bar rather than the page top.
 *
 * A fragment rather than a scroll written by hand, because of when each one runs. The router
 * applies a fragment once the destination has rendered, which is the first moment the page is tall
 * enough to hold the position; scrolling on click instead runs against the page being left, and a
 * profile whose Overview is barely a screen tall has nowhere to put the reader, so they land short.
 */
export function withSpaceTabsAnchor(href: string) {
  return `${href}#${SPACE_TABS_ANCHOR}`;
}
