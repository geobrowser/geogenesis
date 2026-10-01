/**
 * Cursor for the over-fetched, reordered "Best" window (GEO-2690).
 *
 * The diversity cap has to see more items than a page holds, which creates a pagination
 * problem: reorder 66 ranked items, serve 22, and the other 44 have nowhere to live. The
 * server cursor is offset-based over `ranking_score DESC, entity_id DESC` and opaque to
 * us, so it cannot be advanced by a partial amount.
 *
 * Two options were rejected before this one:
 *
 *   * **Advance the server cursor past the whole window.** That is what the pre-existing
 *     code did in miniature — it scanned 30, served 22, and advanced 30, silently losing
 *     8 items per page. At a 66-item window it would lose 44.
 *   * **Query each type separately and merge.** Preston flagged the failure himself:
 *     independent cursors per type make a thin type loop, so on reload "users may see the
 *     same entity over and over".
 *
 * So the window start stays put and we carry an offset into it. Because `applyDiversityCap`
 * is a pure function of the ranked list, re-fetching the same window on the next request
 * reproduces the same ordering, and slicing deeper into it neither repeats nor skips.
 * The cost is that a window is fetched once per page it serves.
 *
 * The ranked list is not perfectly stable — the score has a recency term, and entities
 * scored mid-scroll shift rows underneath the reader. That is already true of every
 * explore sort (the connection's cursors are offsets, not keys) and is documented on
 * `exploreBestConnectionDocument`; the window inherits it rather than adding to it.
 */

const WINDOW_CURSOR_PREFIX = 'w1:';

export type ExploreWindowCursor = {
  /** Server cursor for the item *before* this window, or null for the first window. */
  after: string | null;
  /** How many items of the reordered window have already been served. */
  offset: number;
};

export function encodeExploreWindowCursor(cursor: ExploreWindowCursor): string {
  return `${WINDOW_CURSOR_PREFIX}${cursor.offset}:${cursor.after ?? ''}`;
}

/**
 * Tolerant by design. A bare (non-prefixed) value is a plain server cursor — either from
 * a client that loaded before this shipped and is still scrolling, or from one of the
 * sorts that does not window — and reads as offset 0 of a window starting there. Anything
 * malformed restarts at the first window, which shows a duplicate screen at worst.
 */
export function decodeExploreWindowCursor(raw: string | null): ExploreWindowCursor {
  if (!raw) return { after: null, offset: 0 };
  if (!raw.startsWith(WINDOW_CURSOR_PREFIX)) return { after: raw, offset: 0 };

  const body = raw.slice(WINDOW_CURSOR_PREFIX.length);
  const separator = body.indexOf(':');
  if (separator < 0) return { after: null, offset: 0 };

  // Base64 server cursors contain no ':', but split on the first one regardless so a
  // cursor that someday does still round-trips whole.
  const after = body.slice(separator + 1) || null;
  const offset = Number(body.slice(0, separator));
  if (!Number.isSafeInteger(offset) || offset < 0) return { after, offset: 0 };

  return { after, offset };
}

/**
 * The cursor to hand back after serving `served` items from a window of `windowLength`.
 *
 * Stays in the current window while it has items left, then steps to the next one. Null
 * when the feed is exhausted — including when the server claims another page but gives no
 * cursor to reach it, since re-encoding `after: null` there would restart the feed and
 * scroll forever.
 */
export function nextExploreWindowCursor(args: {
  after: string | null;
  offset: number;
  served: number;
  windowLength: number;
  hasNextPage: boolean;
  endCursor: string | null;
}): string | null {
  const consumed = args.offset + args.served;
  if (consumed < args.windowLength) {
    return encodeExploreWindowCursor({ after: args.after, offset: consumed });
  }
  if (args.hasNextPage && args.endCursor) {
    return encodeExploreWindowCursor({ after: args.endCursor, offset: 0 });
  }
  return null;
}

/**
 * For you cursor (GEO-3083): per stream, the first unserved row's offset and a mask of rows served
 * after it; null once the stream has run out.
 */
const FOR_YOU_CURSOR_PREFIX = 'f2:';

export type ForYouStreamCursor = { offset: number; served: ReadonlySet<number> } | null;
export type ExploreForYouCursor = { topic: ForYouStreamCursor; best: ForYouStreamCursor };

const FOR_YOU_START: ExploreForYouCursor = {
  topic: { offset: 0, served: new Set() },
  best: { offset: 0, served: new Set() },
};

function encodeStream(stream: ForYouStreamCursor): string {
  if (stream === null) return '-';
  let mask = 0n;
  for (const index of stream.served) mask |= 1n << BigInt(index);
  return `${stream.offset}.${mask.toString(36)}`;
}

function decodeStream(raw: string): ForYouStreamCursor | undefined {
  if (raw === '-') return null;
  const match = /^(\d+)\.([0-9a-z]+)$/.exec(raw);
  if (!match) return undefined;
  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset)) return undefined;
  const served = new Set<number>();
  let mask = [...match[2]].reduce((value, digit) => value * 36n + BigInt(parseInt(digit, 36)), 0n);
  for (let index = 0; mask > 0n && index < 1024; index += 1, mask >>= 1n) {
    if (mask & 1n) served.add(index);
  }
  return { offset, served };
}

export function encodeExploreForYouCursor(cursor: ExploreForYouCursor): string {
  return `${FOR_YOU_CURSOR_PREFIX}${encodeStream(cursor.topic)}:${encodeStream(cursor.best)}`;
}

/** Anything that is not a well-formed For you cursor restarts at the first page. */
export function decodeExploreForYouCursor(raw: string | null): ExploreForYouCursor {
  if (!raw?.startsWith(FOR_YOU_CURSOR_PREFIX)) return FOR_YOU_START;
  const parts = raw.slice(FOR_YOU_CURSOR_PREFIX.length).split(':');
  if (parts.length !== 2) return FOR_YOU_START;
  const topic = decodeStream(parts[0]);
  const best = decodeStream(parts[1]);
  if (topic === undefined || best === undefined) return FOR_YOU_START;
  return { topic, best };
}

/**
 * Moves a stream to its first unconsumed row (`consumed` indexes the rows fetched at its offset).
 * Null once a short fetch is fully consumed.
 */
export function advanceForYouStream(
  stream: ForYouStreamCursor,
  consumed: ReadonlySet<number>,
  fetched: number,
  limit: number
): ForYouStreamCursor {
  if (stream === null) return null;
  let frontier = 0;
  while (consumed.has(frontier)) frontier += 1;
  if (frontier >= fetched && fetched < limit) return null;
  // Kept even past this fetch: a later page may read less of the stream than the one that served it.
  const served = new Set<number>();
  for (const index of consumed) if (index > frontier) served.add(index - frontier);
  return { offset: stream.offset + frontier, served };
}
