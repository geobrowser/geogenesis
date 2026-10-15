import * as React from 'react';

/**
 * The box a hub list scrolls in when it scrolls separately from the page: the debates hub panel,
 * and the lobby's claims column on a desktop. Marked with `data-debates-hub-scroll`.
 *
 * The list's paging sentinel and its cards' response reads measure against it. `rootMargin`
 * expands the root, so against the viewport their lead buys nothing in here: the box clips them
 * until they have been scrolled to, which is the moment the lead was meant to come before.
 */
export const HUB_SCROLL_SELECTOR = '[data-debates-hub-scroll]';

const HubScrollSelectorContext = React.createContext<string | undefined>(HUB_SCROLL_SELECTOR);

/**
 * Overrides the selector for a subtree, `undefined` for the viewport. For a box that only scrolls in
 * some layouts, like the lobby's claims column: an observer fixes its root when it is built, so the
 * selector has to change with the layout for the observers to be rebuilt against the right one.
 */
export const HubScrollSelectorProvider = HubScrollSelectorContext.Provider;

/** The selector for this subtree's observers to pass as `rootSelector`. */
export function useHubScrollSelector() {
  return React.useContext(HubScrollSelectorContext);
}
