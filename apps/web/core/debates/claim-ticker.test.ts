import { describe, expect, it } from 'vitest';

import type { ClaimTiming, TimedClaim } from './claim-timing';
import { CLAIM_LINGER_MS, activeTickerClaim, claimMarkers, scoreDebate, tickerWindows } from './claim-ticker';

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
  it('keeps a card up for a beat after the claim finishes, so it can be read and answered', () => {
    const [window] = tickerWindows([timed('a', confident(10_000, 14_000))]);

    expect(window.startMs).toBe(10_000);
    expect(window.endMs).toBe(14_000 + CLAIM_LINGER_MS);
  });

  it('caps a very long claim rather than leaving a card up over the next one', () => {
    const [window] = tickerWindows([timed('a', confident(0, 30_000))]);

    expect(window.endMs).toBe(12_000);
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

describe('activeTickerClaim', () => {
  const windows = tickerWindows([
    timed('first', confident(10_000, 14_000)),
    timed('second', confident(18_000, 22_000)),
  ]);

  it('shows nothing before the first claim is said', () => {
    expect(activeTickerClaim(windows, 5_000)).toBeNull();
  });

  it('shows the claim being said', () => {
    expect(activeTickerClaim(windows, 12_000)?.claim.id).toBe('first');
  });

  it('keeps it up through the linger, then hands over to the next claim', () => {
    expect(activeTickerClaim(windows, 18_000 - 1)?.claim.id).toBe('first');
    // The first claim's linger runs to 19s, but the second starts at 18s and takes over.
    expect(activeTickerClaim(windows, 14_000 + CLAIM_LINGER_MS)?.claim.id).toBe('second');
  });

  it('lets a claim go once its linger expires with nothing after it', () => {
    const lone = tickerWindows([timed('only', confident(10_000, 14_000))]);

    expect(activeTickerClaim(lone, 14_000 + CLAIM_LINGER_MS - 1)?.claim.id).toBe('only');
    expect(activeTickerClaim(lone, 14_000 + CLAIM_LINGER_MS)).toBeNull();
  });

  it('follows the debate when two claims overlap, rather than lagging on the older one', () => {
    const overlapping = tickerWindows([
      timed('earlier', confident(10_000, 20_000)),
      timed('later', confident(14_000, 18_000)),
    ]);

    expect(activeTickerClaim(overlapping, 12_000)?.claim.id).toBe('earlier');
    expect(activeTickerClaim(overlapping, 15_000)?.claim.id).toBe('later');
  });

  // Seeking backwards over a claim you already answered should not ask again.
  it('does not re-ask a claim the viewer has answered or dismissed', () => {
    expect(activeTickerClaim(windows, 12_000, new Set(['first']))).toBeNull();
  });

  it('falls through to another live claim when the top one is dismissed', () => {
    const overlapping = tickerWindows([
      timed('earlier', confident(10_000, 20_000)),
      timed('later', confident(14_000, 18_000)),
    ]);

    expect(activeTickerClaim(overlapping, 15_000, new Set(['later']))?.claim.id).toBe('earlier');
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

describe('scoreDebate', () => {
  it('splits what the viewer answered from what they let go by', () => {
    const claims = [timed('a', confident(1_000, 2_000)), timed('b', confident(3_000, 4_000))];

    const score = scoreDebate(claims, new Set(['a']));

    expect(score.answered).toEqual(['a']);
    expect(score.unanswered.map(claim => claim.id)).toEqual(['b']);
  });
});
