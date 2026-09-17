import { describe, expect, it } from 'vitest';

import type { ClaimTiming, TimedClaim } from './claim-timing';
import { cardOpacity, claimHistory, claimMarkers, tickerStack, tickerWindows } from './claim-ticker';

function timed(id: string, timing: ClaimTiming | null, text = `Claim ${id}`): TimedClaim {
  return { id, text, spaceId: 'space-1', blockId: 'block-1', publishedTiming: null, timing };
}

const confident = (startMs: number, endMs: number): ClaimTiming => ({
  startMs,
  endMs,
  confidence: 1,
  source: 'published',
});

/** Matched, but not well enough to assert over the video. */
const unsure = (startMs: number, endMs: number): ClaimTiming => ({
  startMs,
  endMs,
  confidence: 0.4,
  source: 'segment',
});

const wholeTurn = (startMs: number, endMs: number): ClaimTiming => ({
  startMs,
  endMs,
  confidence: 0,
  source: 'block',
});

describe('tickerWindows', () => {
  it('puts the claims in the order they are said', () => {
    const windows = tickerWindows([timed('b', confident(18_000, 22_000)), timed('a', confident(10_000, 14_000))]);

    expect(windows.map(window => window.claim.id)).toEqual(['a', 'b']);
    expect(windows[0].startMs).toBe(10_000);
  });

  // The live layer asserts "they are saying this now". A claim the matcher placed roughly is fine
  // in the panel and a misquote over the video.
  it('excludes claims the matcher was not confident about, and whole-turn fallbacks', () => {
    const windows = tickerWindows([
      timed('sure', confident(1_000, 2_000)),
      timed('unsure', unsure(3_000, 4_000)),
      timed('turn', wholeTurn(0, 30_000)),
      timed('untimed', null),
    ]);

    expect(windows.map(window => window.claim.id)).toEqual(['sure']);
  });
});

describe('tickerStack', () => {
  const windows = tickerWindows([
    timed('first', confident(10_000, 14_000)),
    timed('second', confident(18_000, 22_000)),
  ]);

  const ids = (playheadMs: number) => tickerStack(windows, playheadMs).map(card => card.window.claim.id);

  it('shows nothing before the first claim is said', () => {
    expect(ids(5_000)).toEqual([]);
  });

  it('shows the claim being said', () => {
    expect(ids(12_000)).toEqual(['first']);
  });

  // The newest is last, so rendered down a column it sits at the bottom, nearest the name, with
  // the older one riding up above it.
  it('stacks a newer claim under the one before it, newest last', () => {
    expect(ids(18_500)).toEqual(['first', 'second']);
  });

  // The behaviour this whole change exists for. A card used to be dropped once its window closed,
  // which left the corner empty for most of a debate; now it rests there until something newer
  // takes its place, and the viewer always has the last thing said in front of them.
  it('keeps a claim on screen long after it was said', () => {
    expect(ids(17_000)).toEqual(['first']);
    expect(ids(200_000)).toEqual(['first', 'second']);
  });

  // Five claims inside ten seconds is an ordinary turn; the corner has to stay a corner. What is
  // pushed off is not lost — `claimHistory` still has it.
  it('rests on only the most recent few when a turn is busy', () => {
    const busy = tickerWindows([
      timed('a', confident(1_000, 2_000)),
      timed('b', confident(1_500, 2_500)),
      timed('c', confident(2_000, 3_000)),
      timed('d', confident(2_500, 3_500)),
    ]);

    expect(tickerStack(busy, 3_000, 3).map(card => card.window.claim.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('claimHistory', () => {
  const windows = tickerWindows([
    timed('a', confident(10_000, 14_000)),
    timed('b', confident(18_000, 22_000)),
    timed('c', confident(30_000, 34_000)),
  ]);

  it('carries everything said so far, oldest first', () => {
    expect(claimHistory(windows, 20_000).map(card => card.window.claim.id)).toEqual(['a', 'b']);
  });

  // A claim the viewer has not reached yet is a spoiler, and "what was said" is a statement about
  // what is behind them.
  it('stops at the playhead rather than listing the whole debate', () => {
    expect(claimHistory(windows, 12_000).map(card => card.window.claim.id)).toEqual(['a']);
    expect(claimHistory(windows, 0).map(card => card.window.claim.id)).toEqual([]);
  });

  // The resting stack's gradient says "this one is passing", which is the wrong thing to say
  // about a list someone has deliberately opened to read.
  it('holds every entry at full strength', () => {
    expect(claimHistory(windows, 200_000).map(card => card.opacity)).toEqual([1, 1, 1]);
  });
});

describe('cardOpacity', () => {
  const [window] = tickerWindows([timed('a', confident(10_000, 14_000))]);

  it('fades in rather than blinking into place', () => {
    expect(cardOpacity(window, 10_000)).toBe(0);
    expect(cardOpacity(window, 10_125)).toBeCloseTo(0.5);
    expect(cardOpacity(window, 10_400)).toBe(1);
  });

  // No fade out any more: a card leaves the resting stack because something newer arrived, not
  // because it timed out, and the stack's own gradient is what dissolves it on the way.
  it('holds at full strength indefinitely once it has arrived', () => {
    expect(cardOpacity(window, 12_000)).toBe(1);
    expect(cardOpacity(window, 999_000)).toBe(1);
  });

  // A scrub lands wherever it lands; the card has to be as visible as its moment says, not as
  // visible as an animation that started when it mounted.
  it('is driven by the playhead, so a scrub back before the claim hides it again', () => {
    expect(cardOpacity(window, 9_000)).toBe(0);
    expect(cardOpacity(window, 13_000)).toBe(1);
  });
});

describe('claimMarkers', () => {
  it('places every precisely-timed claim on the scrubber', () => {
    const markers = claimMarkers(
      [timed('b', confident(135_000, 143_000)), timed('a', confident(27_000, 31_000))],
      270_000
    );

    expect(markers.map(marker => marker.id)).toEqual(['a', 'b']);
    expect(markers[0].fraction).toBeCloseTo(0.1);
  });

  // A marker is a place to jump to. The middle of a 30s turn is not a place.
  it('leaves out claims only known to their turn', () => {
    expect(claimMarkers([timed('turn', wholeTurn(0, 30_000))], 270_000)).toEqual([]);
  });

  it('draws nothing before the duration is known', () => {
    expect(claimMarkers([timed('a', confident(1_000, 2_000))], 0)).toEqual([]);
  });
});
