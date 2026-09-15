import { LIVE_TIMING_CONFIDENCE, type TimedClaim } from './claim-timing';

/**
 * How long a claim card stays up after the debater finishes saying it.
 *
 * Long enough to read a sentence and press a pill, short enough that the next claim is not queuing
 * behind it. Turns in the default format run 30s and produce two or three claims, so a linger much
 * longer than this starts stacking.
 */
export const CLAIM_LINGER_MS = 5_000;

/** A card is never up for longer than this, however long the claim itself ran. */
const MAX_VISIBLE_MS = 12_000;

export type TickerWindow = { claim: TimedClaim; startMs: number; endMs: number };

/**
 * The claims eligible to surface over the video, with the window each is visible for.
 *
 * Only confidently-placed claims qualify. A claim the matcher put in roughly the right region is
 * fine in a list and not fine over the video, where the card asserts "they are saying this now" —
 * and being wrong about that misquotes a real person. Those claims still appear in the panel.
 */
export function tickerWindows(claims: TimedClaim[]): TickerWindow[] {
  return claims
    .filter(claim => claim.timing !== null && claim.timing.confidence >= LIVE_TIMING_CONFIDENCE)
    .map(claim => {
      const timing = claim.timing as NonNullable<TimedClaim['timing']>;
      const endMs = Math.min(timing.endMs + CLAIM_LINGER_MS, timing.startMs + MAX_VISIBLE_MS);
      return { claim, startMs: timing.startMs, endMs };
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * The claim to show at this moment, or null.
 *
 * One card at a time, by design: two debaters talking over each other is the debate, but two cards
 * is a form. When windows overlap — the test debate has a pair eight seconds apart — the most
 * recently started wins, so the card always tracks what is being said now rather than lagging on
 * something that has moved on.
 *
 * `dismissed` carries the claims the viewer has answered or waved away. They are skipped rather
 * than redrawn, so seeking backwards does not re-ask a question already answered.
 */
export function activeTickerClaim(
  windows: TickerWindow[],
  playheadMs: number,
  dismissed: ReadonlySet<string> = new Set()
): TickerWindow | null {
  let active: TickerWindow | null = null;

  for (const window of windows) {
    if (dismissed.has(window.claim.id)) continue;
    if (playheadMs < window.startMs || playheadMs >= window.endMs) continue;
    if (active === null || window.startMs > active.startMs) active = window;
  }

  return active;
}

export type ClaimMarker = { id: string; text: string; atMs: number; fraction: number };

/**
 * Where each claim sits on the scrubber, as a fraction of the debate's length.
 *
 * Every claim with a known moment gets a marker, not just the confident ones: a marker is an
 * offer to jump, and landing a second or two early costs the viewer nothing. Whole-turn fallbacks
 * are excluded — a marker in the middle of a 30s window points at nothing in particular.
 */
export function claimMarkers(claims: TimedClaim[], durationMs: number): ClaimMarker[] {
  if (durationMs <= 0) return [];

  return claims
    .filter(claim => claim.timing !== null && claim.timing.source !== 'block')
    .map(claim => {
      const timing = claim.timing as NonNullable<TimedClaim['timing']>;
      return {
        id: claim.id,
        text: claim.text,
        atMs: timing.startMs,
        fraction: Math.max(0, Math.min(1, timing.startMs / durationMs)),
      };
    })
    .sort((a, b) => a.atMs - b.atMs);
}

/** How the viewer's answers broke down, for the card at the end. */
export type DebateScore = {
  /** Claim ids the viewer answered, in the order they answered them. */
  answered: string[];
  /** Claims with a known moment that the viewer did not answer. */
  unanswered: TimedClaim[];
};

export function scoreDebate(claims: TimedClaim[], answered: ReadonlySet<string>): DebateScore {
  return {
    answered: claims.filter(claim => answered.has(claim.id)).map(claim => claim.id),
    unanswered: claims.filter(claim => !answered.has(claim.id)),
  };
}
