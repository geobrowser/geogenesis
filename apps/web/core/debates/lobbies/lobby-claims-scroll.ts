/**
 * Marks the lobby's claims column while it scrolls on its own, beside the people on a desktop.
 *
 * It is the debates hub panel's attribute, so the Claims tab's paging sentinel — which looks for
 * that panel — measures against this column too. Its cards read against it for the same reason: a
 * card clipped by the column only meets the viewport once it has been scrolled to.
 */
export const LOBBY_CLAIMS_SCROLL_ATTRIBUTE = 'data-debates-hub-scroll';
export const LOBBY_CLAIMS_SCROLL_SELECTOR = `[${LOBBY_CLAIMS_SCROLL_ATTRIBUTE}]`;
