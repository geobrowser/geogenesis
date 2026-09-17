import { type TimedClaim, isAssertableMoment } from './claim-timing';

/** A claim eligible to surface over the video, with the moment it starts being said. */
export type TickerWindow = { claim: TimedClaim; startMs: number };

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
    .map(claim => ({ claim, startMs: (claim.timing as NonNullable<TimedClaim['timing']>).startMs }))
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * How many cards the resting stack shows, before the older ones are left to the history.
 *
 * Two, not three: the stack grows upward from just above the debater's name, and the subtitle sits
 * on the seam above it. Three cards reach into it, which is the crowding this layout exists to
 * avoid. Nothing is lost to the cap — everything said so far is one hover away.
 */
export const MAX_STACKED_CARDS = 2;

/** Long enough to register as arriving rather than blinking into place. */
const FADE_IN_MS = 250;

/**
 * How visible a card is at this moment, in [0, 1].
 *
 * Driven by the playhead rather than a CSS animation, because the playhead is the source of truth
 * and it can jump: a viewer who scrubs back into the middle of a claim should find the card at full
 * strength, not mid-way through an animation that started when the element mounted.
 *
 * There is no fade *out*, because a card no longer expires. It stays until a newer claim pushes it
 * up the stack, where the stack's own gradient dissolves it, and then off the resting stack
 * altogether — still in the history.
 */
export function cardOpacity(window: TickerWindow, playheadMs: number): number {
  const sinceStart = playheadMs - window.startMs;
  if (sinceStart < 0) return 0;
  if (sinceStart < FADE_IN_MS) return sinceStart / FADE_IN_MS;
  return 1;
}

export type StackedCard = { window: TickerWindow; opacity: number };

/**
 * The claims resting over the video right now, oldest first.
 *
 * Rendered in this order down a column, the newest card sits at the bottom, nearest the debater's
 * name, and earlier ones ride up above it — the shape of a live chat rather than a dialog.
 *
 * A card persists once its claim has been said. Cards used to be dropped when their window closed,
 * which left the corner empty for most of a debate and gave the viewer nothing to go back to; and
 * an answered claim was dropped immediately, so the side you had just taken vanished before you
 * could see it register. Now the only thing that moves a card off the resting stack is a newer
 * claim arriving, and the side you took stays on it.
 */
export function tickerStack(
  windows: TickerWindow[],
  playheadMs: number,
  max: number = MAX_STACKED_CARDS
): StackedCard[] {
  return (
    spokenSoFar(windows, playheadMs)
      // Keep the most recent few: what rests over the video is what was said most recently.
      .slice(-max)
      .map(window => ({ window, opacity: cardOpacity(window, playheadMs) }))
  );
}

/**
 * Every claim said so far, oldest first — the list the resting stack opens into on hover.
 *
 * Bounded by the playhead and not by the whole debate. A claim the viewer has not reached yet is a
 * spoiler, and "scroll back through what was said" is only a statement about what is behind them.
 * All at full strength: the resting stack's gradient says "this one is passing", which is the wrong
 * thing to say about a list someone is deliberately reading.
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
