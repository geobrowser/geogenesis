/**
 * The graph explorer's one phone breakpoint (GEO-3849). The map reads it in JS (`useMediaQuery`) for
 * its phone layout and caps; the CSS reads it through the `graph-phone:` / `graph-wide:` variants in
 * `styles/styles.css`, which must spell this exact query (a test pins them). Use those variants for any
 * graph-explorer rule that has to switch with the map, never an ad-hoc `max-[…]:` / `min-[…]:`.
 */
export const GRAPH_PHONE_QUERY = '(max-width: 599px)';

/**
 * On a phone a hop-1 node is a pin (GEO-3864): a marker the map scales with depth over its name at a
 * fixed size. The centre stays a card and hop 2 stays a marker.
 */
export function isPhonePin(phone: boolean, hop: number, isCentre: boolean) {
  return phone && hop === 1 && !isCentre;
}

/** How far stage edges keep a pin's name in, px. */
const PIN_EDGE = 6;

/**
 * How far to slide a pin's name sideways so it stays between the stage's left edge and `rightEdge`
 * (the stage's right edge, or the zoom buttons beside the name), px. It slides no further than
 * keeps it over its marker, so a name never shows without the marker it belongs to.
 */
export function pinShift(x: number, halfWidth: number, rightEdge: number) {
  const reach = Math.max(0, halfWidth - 8);
  const left = x - halfWidth - PIN_EDGE;
  const right = x + halfWidth + PIN_EDGE - rightEdge;
  const shift = left < 0 ? -left : right > 0 ? -right : 0;
  return Math.max(-reach, Math.min(reach, shift));
}

/** A pin's marker size: the map's depth scale, raised so a marker at rest still reads as a dot. */
export function pinMarkerScale(depthScale: number) {
  return Math.max(0.45, Math.min(1.5, depthScale * 1.4));
}
