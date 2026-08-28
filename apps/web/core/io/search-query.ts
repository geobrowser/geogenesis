/**
 * The longest query the REST `/search` endpoint is asked for.
 *
 * The endpoint's own ceiling is 250 — it answers a 250-character query and rejects a longer one
 * with `400 {"error":"Invalid parameter","message":"Query must not exceed 250 characters"}`, which
 * the app surfaced as a search that simply returned nothing. 100 sits well under that, so the cap
 * is about keeping a query useful rather than about staying inside the limit: past a sentence or
 * so, the extra text narrows the match without telling the searcher anything they didn't know.
 */
export const MAX_SEARCH_QUERY_LENGTH = 100;

/**
 * Caps a query at {@link MAX_SEARCH_QUERY_LENGTH} for the search endpoint.
 *
 * A hard cut, not a cut back to the last word boundary. Measured against the endpoint: the same
 * query cut mid-word ("artificial intellig") returns the same top results as the whole one, so the
 * partial token costs nothing — the engine matches it as a prefix. Cutting back to the boundary
 * would throw away signal for no gain, and has a bad case a hard cut doesn't: a long unbroken
 * token — a URL, a hash, an id — has no boundary to cut to, so the rule would either discard the
 * query or need a second rule for when it applies.
 *
 * Sliced by code point rather than by UTF-16 code unit, so the cut never lands inside a surrogate
 * pair. A halved emoji leaves a lone surrogate, which `URLSearchParams` silently turns into a
 * replacement character and `encodeURIComponent` throws outright on — a worse failure than the one
 * being fixed. Note this counts code points, so a ZWJ sequence can still be split into the valid
 * emoji it is built from; that renders sensibly, unlike half a surrogate pair.
 *
 * Leading whitespace is dropped first, so it cannot eat the budget. The endpoint discards it before
 * searching — `"          football"` and `"football"` return the same results — so a hundred spaces
 * followed by the actual query would otherwise cap to a hundred spaces, which the endpoint reads as
 * no query at all and answers with generic top results. Trailing whitespace stays: someone
 * mid-sentence has a trailing space that is part of what they are typing, and it costs nothing.
 */
export function capSearchQuery(query: string): string {
  const trimmed = query.trimStart();

  // Fast path: `Array.from` walks the whole string, and nearly every query is far short of the cap.
  if (trimmed.length <= MAX_SEARCH_QUERY_LENGTH) return trimmed;

  return Array.from(trimmed).slice(0, MAX_SEARCH_QUERY_LENGTH).join('');
}
