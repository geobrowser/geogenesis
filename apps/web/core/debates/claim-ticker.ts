import { type TimedClaim, isAssertableMoment } from './claim-timing';

/**
 * How long a claim card stays up after the debater finishes saying it.
 *
 * Long enough to read a sentence and press a thumb, short enough that the next claim is not queuing
 * behind it. Turns in the default format run 30s and produce two or three claims, so a linger much
 * longer than this starts stacking.
 */
export const CLAIM_LINGER_MS = 5_000;

/** A card is never up for longer than this, however long the claim itself ran. */
const MAX_VISIBLE_MS = 12_000;

/** A claim eligible to surface over the video, with the window it is on screen for. */
export type TickerWindow = { claim: TimedClaim; startMs: number; endMs: number };

/**
 * The claims eligible to surface over the video, in the order they are said.
 *
 * Only confidently-placed claims qualify. A claim the matcher put in roughly the right region is
 * fine in a list and not fine over the video, where the card asserts "they are saying this now" —
 * and being wrong about that misquotes a real person. Those claims still appear in the panel.
 */
export function tickerWindows(claims: TimedClaim[]): TickerWindow[] {
  return claims
    .filter(claim => isAssertableMoment(claim.timing))
    .map(claim => {
      const timing = claim.timing as NonNullable<TimedClaim['timing']>;
      return {
        claim,
        startMs: timing.startMs,
        endMs: Math.min(timing.endMs + CLAIM_LINGER_MS, timing.startMs + MAX_VISIBLE_MS),
      };
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * How many cards may be stacked over the video at once, before the oldest is dropped.
 *
 * Two, not three: the stack grows upward from just above the debater's name, and the subtitle sits
 * on the seam above it. Three cards reach into it, which is the crowding this layout exists to
 * avoid. Nothing is lost to the cap — everything said so far is one hover away.
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
 * The claims on screen right now, oldest first.
 *
 * Rendered in this order down a column, the newest card sits at the bottom, nearest the debater's
 * name, and earlier ones ride up above it — the shape of a live chat rather than a dialog.
 *
 * A card expires with its window and the corner goes quiet again. Cards were briefly made permanent
 * so there was always something to go back to; that is what {@link claimHistory} is for now, and it
 * is a better answer, because it does not cost the video a permanently occupied corner to get it.
 *
 * Answering does *not* retire a card early. It used to, which took the side the viewer had just
 * chosen off the screen before they saw it land; the filled icon is the acknowledgement, and the
 * window runs out on its own soon enough.
 */
export function tickerStack(
  windows: TickerWindow[],
  playheadMs: number,
  max: number = MAX_STACKED_CARDS
): StackedCard[] {
  return (
    spokenSoFar(windows, playheadMs)
      .filter(window => playheadMs < window.endMs)
      // Drop the oldest when there are more than fit, so what is on screen is what was just said.
      .slice(-max)
      .map(window => ({ window, opacity: cardOpacity(window, playheadMs) }))
  );
}

/**
 * Every claim said so far, oldest first — the list the corner opens into on hover.
 *
 * Not bounded by the card windows: this is the backlog, and the whole point of it is the claims
 * whose moment has passed. Bounded by the playhead instead, because a claim the viewer has not
 * reached yet is a spoiler and "scroll back through what was said" is only a statement about what
 * is behind them.
 *
 * All at full strength: the live stack's gradient says "this one is passing", which is the wrong
 * thing to say about a list someone has deliberately opened to read.
 */
export function claimHistory(windows: TickerWindow[], playheadMs: number): StackedCard[] {
  return spokenSoFar(windows, playheadMs).map(window => ({ window, opacity: 1 }));
}

/** `windows` arrives sorted by {@link tickerWindows}, so this stays in spoken order. */
function spokenSoFar(windows: TickerWindow[], playheadMs: number): TickerWindow[] {
  return windows.filter(window => playheadMs >= window.startMs);
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
