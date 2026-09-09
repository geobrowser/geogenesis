/**
 * How many items the user explicitly asked to see, when they named a number.
 *
 * The closer caps every list at 5 items because its reply is bounded and one
 * `geo://` pill costs ~50 tokens — two 32-char hex ids tokenize badly, so a
 * longer list gets truncated mid-citation and renders as broken markdown
 * instead of pills. That cap is correct right up until the user names a count:
 * asking for 15 projects and being handed 5 is a wrong answer, not a concise
 * one.
 *
 * Keyed on the *request*, not on what came back. A query that happens to return
 * 200 rows is still better summarised; "give me 15" is an instruction.
 */

// The closer's standing list cap. A request at or under it is already satisfied
// by default behaviour, so there is nothing to buy and no reason to risk a
// stray number ("I saw 3 blocks") narrowing a list to 3.
const DEFAULT_LIST_CAP = 5;

// A number followed by one of these is a duration or a date, not a quantity of
// results — "published in the last 7 days" must not buy a 7-item budget.
const NON_ITEM_UNIT = /^(?:day|week|month|year|hour|min|minute|second|sec|am|pm|st|nd|rd|th)s?$/i;

// "give me 15", "show me the top 20", "pull 30", "I need 12"
const REQUEST_VERB = /(?:give|show|send|get|fetch|find|list|need|want|see|display|return|provide|bring|pull)\s+(?:me\s+)?(?:the\s+)?(?:top\s+|first\s+)?$/i;

// "top 10", "first 25", "another 15"
const RANK_WORD = /(?:top|first|latest|last|next|another|more)\s+$/i;

/**
 * Returns the count the user named, or null when they didn't name one.
 *
 * Unclamped on purpose: the caller needs the raw ask to tell the user "showing
 * 25 of the 200 you asked for". Deciding how much reply that buys is a budget
 * question and lives with the closer, not here.
 *
 * Only matches digits — "give me fifteen projects" reads as no request, which
 * keeps the default cap rather than guessing.
 */
export function requestedItemCount(text: string): number | null {
  if (!text) return null;

  let best: number | null = null;

  // `\d{1,3}` bounded on both sides: a year or an id fragment ("2026",
  // "c924dc02") has no word boundary after three digits, so it never matches.
  for (const match of text.matchAll(/\b(\d{1,3})\b\s*([a-z]+)?/gi)) {
    const count = Number(match[1]);
    if (count <= DEFAULT_LIST_CAP) continue;

    const before = text.slice(Math.max(0, match.index - 40), match.index);
    const after = match[2];

    // Vetoes before any of the match branches below, not just the bare-noun
    // one: "the last 7 days" reads as a rank word plus a number otherwise, and
    // date-range questions are the most common thing this sees.
    if (after !== undefined && NON_ITEM_UNIT.test(after)) continue;

    const askedFor =
      REQUEST_VERB.test(before) ||
      RANK_WORD.test(before) ||
      // "15 projects" — a plural noun, already known not to be a time unit.
      (after !== undefined && after.length >= 3 && after.endsWith('s'));

    if (!askedFor) continue;

    if (best === null || count > best) best = count;
  }

  return best;
}
