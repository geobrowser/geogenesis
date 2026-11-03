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

/**
 * The hub's sticky filter bar (`HubStickyControls`), which pins to the top of the box a list scrolls
 * in. Marked with `data-hub-sticky-controls`. Its height follows its filters, so a jump measures it
 * rather than guessing.
 */
export const HUB_STICKY_CONTROLS_SELECTOR = '[data-hub-sticky-controls]';

/**
 * Brings `node` to the top of `scroller`, or of the page when the list has no box of its own
 * (phones), clear of whatever is pinned there: the offset is the section's own `scroll-margin-top`,
 * plus `extraOffset` for a pinned bar whose height is only known when it is measured.
 */
export function scrollToSection(node: HTMLElement, scroller: HTMLElement | null, extraOffset = 0) {
  const margin = (Number.parseFloat(getComputedStyle(node).scrollMarginTop) || 0) + extraOffset;
  if (scroller) {
    const top = scrollOffsetWithin(node, scroller) - margin;
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior: 'smooth' });
    else scroller.scrollTop = top;
    return;
  }
  window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - margin, behavior: 'smooth' });
}

/**
 * How far down `scroller`'s content `node` starts: the `scrollTop` that would put it at the very top
 * of the box. What a jump subtracts its clearance from — here, and the Requests timeline's pin.
 */
export function scrollOffsetWithin(node: Element, scroller: HTMLElement) {
  return node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}
