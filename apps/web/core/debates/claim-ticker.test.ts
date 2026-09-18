import { describe, expect, it } from 'vitest';

import type { ClaimTiming, TimedClaim } from './claim-timing';
import {
  CLAIM_LINGER_MS,
  cardOpacity,
  claimHistory,
  claimMarkers,
  tickerStack,
  tickerWindows,
} from './claim-ticker';

function timed(id: string, timing: ClaimTiming | null, text = `Claim ${id}`): TimedClaim {
  return { id, text, spaceId: 'space-1', blockId: 'block-1', publishedTiming: null, relationEntityId: null, timing };
}

const confident = (startMs: number, endMs: number): ClaimTiming => ({
  startMs,
  endMs,
  confidence: 1,
  source: 'published',
});

/**
 * Matched, but not well enough to assert over the video.
 *
 * 0.28 rather than something nearer the bar on purpose: this is the band where windows collapse to
 * a word or two and land in an arbitrary part of the turn, which is what the bar exists to catch.
 */
const unsure = (startMs: number, endMs: number): ClaimTiming => ({
  startMs,
  endMs,
  confidence: 0.28,
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
    // The card's window, not the claim's: 'a' is said 10_000–14_000 and its card shows from 14_000.
    expect(windows[0].startMs).toBe(14_000);
  });

  // The behaviour Preston asked for: a card that arrives as the debater *starts* asserts a claim
  // the viewer has not heard them make yet. It has to read as "he just said this".
  it('shows the card once the claim has been said, not while it is being said', () => {
    const [window] = tickerWindows([timed('a', confident(10_000, 14_000))]);

    expect(window.startMs).toBe(14_000);
    expect(window.endMs).toBe(14_000 + CLAIM_LINGER_MS);
  });

  // Measuring from the end is what retired the old cap: a window that began at the claim's start
  // grew with the claim and had to be clamped so a long one did not sit over the next.
  it('gives every card the same time on screen however long the claim ran', () => {
    const [long] = tickerWindows([timed('a', confident(0, 30_000))]);
    const [short] = tickerWindows([timed('b', confident(0, 1_000))]);

    expect(long.endMs - long.startMs).toBe(CLAIM_LINGER_MS);
    expect(short.endMs - short.startMs).toBe(CLAIM_LINGER_MS);
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
  // Cards show 14_000–22_000 and 22_000–30_000: each claim's end, plus the linger.
  const windows = tickerWindows([
    timed('first', confident(10_000, 14_000)),
    timed('second', confident(18_000, 22_000)),
  ]);

  const ids = (playheadMs: number) => tickerStack(windows, playheadMs).map(card => card.window.claim.id);

  it('shows nothing before the first claim is said', () => {
    expect(ids(5_000)).toEqual([]);
  });

  it('stays quiet while the claim is still being said', () => {
    expect(ids(12_000)).toEqual([]);
  });

  it('shows the claim once it has been said', () => {
    expect(ids(14_500)).toEqual(['first']);
  });

  // The newest is last, so rendered down a column it sits at the bottom, nearest the name, with
  // the older one riding up above it.
  it('stacks a newer claim under the one before it, newest last', () => {
    const overlapping = tickerWindows([
      timed('first', confident(10_000, 14_000)),
      timed('second', confident(14_500, 18_000)),
    ]);

    expect(tickerStack(overlapping, 18_500).map(card => card.window.claim.id)).toEqual(['first', 'second']);
  });

  // Cards expire, so the corner is empty most of the time. What has scrolled past is not lost —
  // `claimHistory` has it, one hover away.
  it('drops a claim once its window closes', () => {
    expect(ids(14_000 + CLAIM_LINGER_MS)).toEqual(['second']);
    expect(ids(200_000)).toEqual([]);
  });

  // Five claims inside ten seconds is an ordinary turn; the corner has to stay a corner. What is
  // pushed off is not lost — `claimHistory` still has it.
  it('shows only the most recent few when a turn is busy', () => {
    const busy = tickerWindows([
      timed('a', confident(1_000, 2_000)),
      timed('b', confident(1_500, 2_500)),
      timed('c', confident(2_000, 3_000)),
      timed('d', confident(2_500, 3_500)),
    ]);

    expect(tickerStack(busy, 3_600, 3).map(card => card.window.claim.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('claimHistory', () => {
  const windows = tickerWindows([
    timed('a', confident(10_000, 14_000)),
    timed('b', confident(18_000, 22_000)),
    timed('c', confident(30_000, 34_000)),
  ]);

  it('carries everything said so far, oldest first', () => {
    // 'a' finishes at 14_000 and 'b' at 22_000, so at 23_000 both have been said and 'c' has not.
    expect(claimHistory(windows, 23_000).map(card => card.window.claim.id)).toEqual(['a', 'b']);
  });

  // The whole point of the backlog: it holds the claims whose cards have expired, which is what
  // the live stack no longer does.
  it('keeps claims whose window has long closed', () => {
    expect(tickerStack(windows, 200_000)).toEqual([]);
    expect(claimHistory(windows, 200_000).map(card => card.window.claim.id)).toEqual(['a', 'b', 'c']);
  });

  // A claim the viewer has not reached yet is a spoiler, and "what was said" is a statement about
  // what is behind them.
  it('stops at the playhead rather than listing the whole debate', () => {
    expect(claimHistory(windows, 15_000).map(card => card.window.claim.id)).toEqual(['a']);
    expect(claimHistory(windows, 0).map(card => card.window.claim.id)).toEqual([]);
  });

  // The live stack's gradient says "this one is passing", which is the wrong thing to say about
  // a list someone has deliberately opened to read.
  it('holds every entry at full strength', () => {
    expect(claimHistory(windows, 200_000).map(card => card.opacity)).toEqual([1, 1, 1]);
  });
});

describe('cardOpacity', () => {
  const [window] = tickerWindows([timed('a', confident(10_000, 14_000))]);

  it('fades in rather than blinking into place', () => {
    expect(cardOpacity(window, 14_000)).toBe(0);
    expect(cardOpacity(window, 14_125)).toBeCloseTo(0.5);
    expect(cardOpacity(window, 14_400)).toBe(1);
  });

  it('holds at full strength through the middle', () => {
    expect(cardOpacity(window, 17_000)).toBe(1);
  });

  it('fades out over the tail of its window', () => {
    expect(cardOpacity(window, window.endMs - 750)).toBeCloseTo(0.5);
    expect(cardOpacity(window, window.endMs - 1)).toBeLessThan(0.01);
  });

  // A scrub lands wherever it lands; the card has to be as visible as its moment says, not as
  // visible as an animation that started when it mounted.
  it('is driven by the playhead, so a scrub into the middle lands at full strength', () => {
    expect(cardOpacity(window, 17_000)).toBe(1);
    // Before the card appears — which now includes while the claim is still being said.
    expect(cardOpacity(window, 12_000)).toBe(0);
    expect(cardOpacity(window, 99_000)).toBe(0);
  });
});

describe('claimMarkers', () => {
  it('places every precisely-timed claim on the scrubber', () => {
    const markers = claimMarkers(
      [timed('b', confident(135_000, 143_000)), timed('a', confident(27_000, 31_000))],
      270_000
    );

    expect(markers.map(marker => marker.id)).toEqual(['a', 'b']);
  });

  // The hash has to sit where the card appears, or the two ways the timeline talks about one claim
  // disagree — the mark is somewhere the card will not show up for several more seconds.
  it('marks the end of the claim, where its card appears', () => {
    const [marker] = claimMarkers([timed('a', confident(27_000, 31_000))], 310_000);

    expect(marker.atMs).toBe(31_000);
    expect(marker.fraction).toBeCloseTo(0.1);
  });

  // The bug this argument exists for. It used to be the latest claim's end, which only matches the
  // track the markers are drawn on when the last claim runs to the final second. Measured on live
  // debates the gap reached 11% — about 20 seconds out on a 210-second debate.
  it('scales by the debate timeline, not by the last claim', () => {
    const claims = [timed('a', confident(50_000, 60_000)), timed('b', confident(90_000, 100_000))];

    const markers = claimMarkers(claims, 200_000);

    expect(markers[0].fraction).toBeCloseTo(0.3);
    expect(markers[1].fraction).toBeCloseTo(0.5);
  });

  // A marker is a place to jump to. The middle of a 30s turn is not a place.
  it('leaves out claims only known to their turn', () => {
    expect(claimMarkers([timed('turn', wholeTurn(0, 30_000))], 270_000)).toEqual([]);
  });

  // The bug Preston found. Markers used to take any match at all, so a debate whose claims all
  // matched loosely drew hashes that never produced a card — eight of them on one real debate. A
  // hash promises something is there, so it holds the same bar the card does.
  it('leaves out a match too loose to show a card for', () => {
    expect(claimMarkers([timed('loose', unsure(27_000, 31_000))], 270_000)).toEqual([]);
  });

  it('draws nothing before the timeline is known', () => {
    expect(claimMarkers([timed('a', confident(1_000, 2_000))], 0)).toEqual([]);
  });
});
