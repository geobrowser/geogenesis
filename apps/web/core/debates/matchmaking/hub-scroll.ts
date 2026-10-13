/**
 * The box a hub list scrolls in when it scrolls separately from the page: the debates hub panel,
 * and the lobby's claims column on a desktop. Marked with `data-debates-hub-scroll`.
 *
 * The list's paging sentinel and its cards' response reads measure against it. `rootMargin`
 * expands the root, so against the viewport their lead buys nothing in here: the box clips them
 * until they have been scrolled to, which is the moment the lead was meant to come before.
 */
export const HUB_SCROLL_SELECTOR = '[data-debates-hub-scroll]';
