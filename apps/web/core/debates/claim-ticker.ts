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
 * How many cards may be stacked over a debater at once, before the oldest is dropped.
 *
 * Two, not three: the stack grows upward from just above the debater's name, and the subtitle sits
 * a little higher on the same tile. Three cards reach into it, which is the crowding this layout
 * exists to avoid.
 */
export const MAX_STACKED_CARDS = 2;

/** Long enough to register as arriving rather than blinking into place. */
const FADE_IN_MS = 250;
/** The tail of a card's window, over which it fades out instead of vanishing. */
const FADE_OUT_MS = 1_500;

/**
 * How visible a card is at this moment, in [0, 1].
 *
 * Driven by the playhead rather than a CSS animation, because the playhead is the source of truth
 * and it can jump: a viewer who scrubs back into the middle of a claim should find the card at full
 * strength, not mid-way through an animation that started when the element mounted.
 */
export function cardOpacity(window: TickerWindow, playheadMs: number): number {
  if (playheadMs < window.startMs || playheadMs >= window.endMs) return 0;

  const sinceStart = playheadMs - window.startMs;
  if (sinceStart < FADE_IN_MS) return sinceStart / FADE_IN_MS;

  const untilEnd = window.endMs - playheadMs;
  if (untilEnd < FADE_OUT_MS) return untilEnd / FADE_OUT_MS;

  return 1;
}

export type StackedCard = { window: TickerWindow; opacity: number };

/**
 * The claims to show over a debater right now, oldest first.
 *
 * Rendered in this order down a column, the newest card sits at the bottom, nearest the debater's
 * name, and earlier ones ride up above it as they age out — the shape of a live chat rather than a
 * dialog. Capped at {@link MAX_STACKED_CARDS}: a busy turn can put five claims inside ten seconds,
 * and the point of the corner is that it leaves the face alone.
 *
 * `dismissed` carries the claims the viewer has answered or waved away. They are skipped rather
 * than redrawn, so seeking backwards does not re-ask a question already answered.
 */
export function tickerStack(
  windows: TickerWindow[],
  playheadMs: number,
  dismissed: ReadonlySet<string> = new Set(),
  max: number = MAX_STACKED_CARDS
): StackedCard[] {
  return windows
    .filter(
      window =>
        !dismissed.has(window.claim.id) && playheadMs >= window.startMs && playheadMs < window.endMs
    )
    .sort((a, b) => a.startMs - b.startMs)
    // Drop the oldest when there are more than fit, so what is on screen is what was just said.
    .slice(-max)
    .map(window => ({ window, opacity: cardOpacity(window, playheadMs) }));
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
