/**
 * The fresh slot's state across one scroll (GEO-3221), wrapped around Best's window cursor.
 *
 * `asOfMs` pins the Fresh list: every page of a scroll asks for the items created in the same
 * `[asOf - freshnessHours, asOf]` range, so the list, and the positions cut from it, do not move
 * while someone reads. `shown` is the bitmask of Fresh-list indices that earlier windows of the
 * scroll already showed, so no item is shown twice. Pages inside one window share the window's
 * starting mask; it advances only when the scroll steps to the next window.
 */
const FRESH_CURSOR_PREFIX = 's1:';

/** The Fresh list is fetched at most this long, which bounds the mask. */
export const FRESH_SLOT_CANDIDATE_LIMIT = 48;

export type FreshSlotCursor = {
  asOfMs: number;
  shown: ReadonlySet<number>;
  /** Best's own window cursor, untouched. */
  inner: string | null;
};

export function encodeFreshSlotCursor(cursor: FreshSlotCursor): string {
  let mask = 0n;
  for (const index of cursor.shown) {
    if (Number.isSafeInteger(index) && index >= 0 && index < FRESH_SLOT_CANDIDATE_LIMIT) mask |= 1n << BigInt(index);
  }
  return `${FRESH_CURSOR_PREFIX}${cursor.asOfMs}.${mask.toString(36)}:${cursor.inner ?? ''}`;
}

/**
 * `pinned` is false for anything that is not a fresh cursor: the first page (null) or a scroll
 * that began without the fresh slot. Such a scroll stays without it, because starting the merge
 * mid-window would move the page boundaries under the reader.
 */
export function decodeFreshSlotCursor(
  raw: string | null,
  now: number
): FreshSlotCursor & { pinned: boolean; firstPage: boolean } {
  if (raw === null || raw === '') return { asOfMs: now, shown: new Set(), inner: null, pinned: false, firstPage: true };
  if (!raw.startsWith(FRESH_CURSOR_PREFIX)) {
    return { asOfMs: now, shown: new Set(), inner: raw, pinned: false, firstPage: false };
  }
  const body = raw.slice(FRESH_CURSOR_PREFIX.length);
  const separator = body.indexOf(':');
  const head = separator >= 0 ? body.slice(0, separator) : body;
  const inner = separator >= 0 ? body.slice(separator + 1) || null : null;
  const match = /^(\d+)\.([0-9a-z]+)$/.exec(head);
  const asOfMs = match ? Number(match[1]) : NaN;
  if (!match || !Number.isSafeInteger(asOfMs) || asOfMs <= 0) {
    return { asOfMs: now, shown: new Set(), inner, pinned: false, firstPage: false };
  }
  const shown = new Set<number>();
  let mask = [...match[2]!].reduce((value, digit) => value * 36n + BigInt(parseInt(digit, 36)), 0n);
  for (let index = 0; mask > 0n && index < FRESH_SLOT_CANDIDATE_LIMIT; index += 1, mask >>= 1n) {
    if (mask & 1n) shown.add(index);
  }
  return { asOfMs, shown, inner, pinned: true, firstPage: false };
}
