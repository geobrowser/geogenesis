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
 * Sideways slide, px, keeping a pin's name between the stage's left edge and `rightEdge`; never so
 * far that the name leaves its marker.
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

export type Rect = { left: number; right: number; top: number; bottom: number };

/** Where a pin's name sits around its marker, in the order they are tried. */
export const NAME_PLACES = ['below', 'left', 'right', 'above'] as const;
export type NamePlace = (typeof NAME_PLACES)[number];

/**
 * A pin on screen: its marker's centre at x, y; `anchor` is half the marker's box height, which
 * starts at the pin's top; `width` and `height` are the whole pin's box (marker, gap, name).
 */
export type PinBox = { x: number; y: number; anchor: number; width: number; height: number };

/** The pin's gap between marker and name (`gap-1`). */
const GAP = 4;

/** The name's rect at `place`, and its offset from where the pin lays it out (centred below). */
export function nameAt(place: NamePlace, pin: PinBox, stageWidth: number) {
  const { x, y, anchor, width } = pin;
  const height = pin.height - 2 * anchor - GAP;
  const top = y + anchor + GAP;
  const beside = anchor + GAP + width / 2;
  const [dx, dy] =
    place === 'below'
      ? [pinShift(x, width / 2, stageWidth), 0]
      : place === 'above'
        ? [pinShift(x, width / 2, stageWidth), -(2 * anchor + 2 * GAP + height)]
        : [place === 'left' ? -beside : beside, -height / 2 - anchor - GAP];
  const left = x - width / 2 + dx;
  return { dx, dy, rect: { left, right: left + width, top: top + dy, bottom: top + dy + height } };
}

function overlaps(a: Rect, b: Rect) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The first place, the current one first so a name doesn't hop, where the name is on the stage and
 * clear of the overlays (zoom buttons, sheet, hint). `clear` is false when none is; it stays below.
 */
export function placeName(
  pin: PinBox,
  stage: { width: number; height: number },
  obstacles: readonly Rect[],
  current: NamePlace
) {
  for (const place of [current, ...NAME_PLACES.filter(other => other !== current)]) {
    const at = nameAt(place, pin, stage.width);
    const { rect } = at;
    const onStage = rect.left >= 0 && rect.right <= stage.width && rect.top >= 0 && rect.bottom <= stage.height;
    if (onStage && !obstacles.some(obstacle => overlaps(rect, obstacle))) return { place, clear: true, ...at };
  }
  return { place: 'below' as const, clear: false, ...nameAt('below', pin, stage.width) };
}
