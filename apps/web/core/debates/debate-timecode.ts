/**
 * Linking to the moment in a debate where something was said.
 *
 * A claim extracted from a transcript knows when it was spoken (see `claim-timing.ts`), so a row
 * showing that claim can offer to open the debate at that point rather than at the beginning. The
 * position rides the link as a query param, which is what makes the link shareable and survives a
 * cold load — the reader who receives it has no player mounted to seek.
 *
 * Seconds, not milliseconds: the param is user-visible and gets pasted around, and a debate's
 * timeline is not precise enough for a millisecond to mean anything. `ClaimTiming` carries
 * milliseconds because the matcher works in them; the conversion happens here, once.
 */

/** Query param carrying a start position, in whole seconds. Matches the convention YouTube uses. */
export const DEBATE_TIME_PARAM = 't';

/**
 * Lead-in subtracted from a claim's start before seeking.
 *
 * Landing exactly on the first word clips its own beginning — the matcher's start is where the
 * phrase begins, not where the speaker drew breath — and the sentence arrives without the turn it
 * answers. Two seconds is enough to hear the run-up without replaying the previous point.
 */
export const TIMECODE_PREROLL_SECONDS = 2;

/** Longest position a link may carry, in seconds. Twelve hours; anything beyond is a corrupt param. */
const MAX_POSITION_SECONDS = 12 * 60 * 60;

/**
 * Where playback should start for a claim spoken at `startMs`, in whole seconds.
 *
 * Clamped at zero so a claim in the first two seconds of a recording does not ask for a negative
 * position, which `HTMLMediaElement.currentTime` rejects.
 */
export function debateSeekSeconds(startMs: number): number {
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.round(startMs / 1000) - TIMECODE_PREROLL_SECONDS);
}

/**
 * The position a link is asking for, or null when it isn't asking for one.
 *
 * Deliberately forgiving about the shape and strict about the value. These links are pasted by
 * hand and arrive through `useSearchParams`, which hands back `string | string[] | null`, so the
 * parser takes all of those. But a value that is not a finite, non-negative, in-range number is
 * null rather than clamped: a link that says `t=abc` is not asking to start at zero, it is not
 * asking for anything, and starting playback from the top is what happens anyway when no param is
 * present. Clamping would make a corrupt link indistinguishable from a deliberate `t=0`.
 */
export function parseDebateTimeParam(raw: string | string[] | null | undefined): number | null {
  // `?t=1&t=2` is a malformed link rather than a choice between two positions, so read the first
  // and ignore the rest — the same way a router resolves a repeated param.
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || value === '') return null;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_POSITION_SECONDS) return null;

  return Math.floor(seconds);
}

/**
 * Adds a start position to a link, replacing one already there.
 *
 * Works on the relative paths `NavUtils` produces, which have no origin, so `URL` cannot be used
 * without inventing a base and stripping it again. The hash is preserved and stays last, because
 * a fragment after the query is the only order a browser reads.
 */
export function withDebateTimecode(href: string, seconds: number): string {
  const hashIndex = href.indexOf('#');
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
  const base = hashIndex === -1 ? href : href.slice(0, hashIndex);

  const queryIndex = base.indexOf('?');
  const path = queryIndex === -1 ? base : base.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex === -1 ? '' : base.slice(queryIndex + 1));
  params.set(DEBATE_TIME_PARAM, String(Math.max(0, Math.floor(seconds))));

  return `${path}?${params.toString()}${hash}`;
}
