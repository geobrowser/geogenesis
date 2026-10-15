import { describe, expect, it } from 'vitest';

import type { Debate, DebateParticipant } from './api';
import {
  CLAIM_LINGER_MS,
  backlogWindows,
  claimHistory,
  claimMarkers,
  drawableClaims,
  speakersByClaimId,
} from './claim-ticker';
import type { ClaimTiming, TimedClaim } from './claim-timing';
import { PLAYBACK_END_EPSILON_MS } from './playback-utils';

function timed(id: string, timing: ClaimTiming | null, text = `Claim ${id}`): TimedClaim {
  return {
    id,
    text,
    spaceId: 'space-1',
    blockId: 'block-1',
    publishedTiming: null,
    highlightScore: null,
    relevanceScore: null,
    qualityScore: null,
    controversyScore: null,
    relationEntityId: null,
    restated: false,
    timing,
  };
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

describe('the claim windows', () => {
  it('puts the claims in the order they are said', () => {
    const windows = backlogWindows([timed('b', confident(18_000, 22_000)), timed('a', confident(10_000, 14_000))]);

    expect(windows.map(window => window.claim.id)).toEqual(['a', 'b']);
  });

  // A claim counted as the debater *starts* asserts something the viewer has not heard them make
  // yet. It joins the count once it has been said.
  it('opens once the claim has been said, not while it is being said', () => {
    const [window] = backlogWindows([timed('a', confident(10_000, 14_000))]);

    expect(window.startMs).toBe(14_000);
    expect(window.endMs).toBe(14_000 + CLAIM_LINGER_MS);
  });
});

/**
 * The counter takes any claim it can place, not only the ones firm enough for a scrubber hash.
 *
 * A filtered list made the corner disagree with itself: it counted "N claims" and the list opened
 * on a subset, silently dropping everything the matcher had placed only loosely.
 */
describe('backlogWindows', () => {
  const claims = [
    timed('published', confident(10_000, 14_000)),
    timed('loose', unsure(18_000, 22_000)),
    timed('whole-turn', wholeTurn(0, 30_000)),
    timed('unplaced', null),
  ];

  // Ordered by when each claim *finished* being said, so the whole-turn fallback — which ends when
  // its turn does — joins the list last rather than at the turn's start.
  it('includes claims too loosely placed for a scrubber hash', () => {
    expect(backlogWindows(claims).map(w => w.claim.id)).toEqual(['published', 'loose', 'whole-turn']);
  });

  it('still leaves out a claim with no timing at all, which cannot be ordered', () => {
    expect(backlogWindows(claims).map(w => w.claim.id)).not.toContain('unplaced');
  });
});

describe('claimHistory', () => {
  const windows = backlogWindows([
    timed('a', confident(10_000, 14_000)),
    timed('b', confident(18_000, 22_000)),
    timed('c', confident(30_000, 34_000)),
  ]);

  it('carries everything said so far, oldest first', () => {
    // 'a' finishes at 14_000 and 'b' at 22_000, so at 23_000 both have been said and 'c' has not.
    expect(claimHistory(windows, 23_000).map(card => card.window.claim.id)).toEqual(['a', 'b']);
  });

  // A claim stays counted long after its moment.
  it('keeps claims whose window has long closed', () => {
    expect(claimHistory(windows, 200_000).map(card => card.window.claim.id)).toEqual(['a', 'b', 'c']);
  });

  // A claim the viewer has not reached yet is a spoiler, and "what was said" is a statement about
  // what is behind them.
  it('stops at the playhead rather than listing the whole debate', () => {
    expect(claimHistory(windows, 15_000).map(card => card.window.claim.id)).toEqual(['a']);
    expect(claimHistory(windows, 0).map(card => card.window.claim.id)).toEqual([]);
  });
});

/**
 * A marker sits at the claim's end and seeks just inside its window, so the claim is in its
 * debater's counter wherever the paused playhead rounds to.
 */
describe('claimMarkers seek target', () => {
  /** The claims the counter holds at `atMs`. */
  const counted = (claim: TimedClaim, atMs: number) =>
    claimHistory(backlogWindows([claim]), atMs).map(card => card.window.claim.id);

  /**
   * Three of 51 debates end on their last claim, and a hash there can only ever be a broken
   * promise: the seek has to stay out of the stretch `playbackEnded` calls the end, which is
   * earlier than the claim's own window opens, and the counter's list starts at that window. So
   * the claim is not in it, wherever the click lands.
   */
  it('draws no hash for a claim that ends on the final frame', () => {
    expect(claimMarkers([timed('a', confident(10_000, 30_000))], 30_000)).toEqual([]);
  });

  /**
   * A claim ending just inside the reachable stretch keeps its hash, and the seek is clamped rather
   * than dropped — the claim is counted where the click lands, which is the whole contract.
   *
   * Against the shared threshold, not the duration: `playbackEnded` calls the last
   * `PLAYBACK_END_EPSILON_MS` the end, so the first version of this clamp — a millisecond short of
   * `timelineMs` — was still inside it and took the corner down exactly as before.
   */
  it('clamps rather than drops a claim ending just short of it', () => {
    const endMs = 30_000 - PLAYBACK_END_EPSILON_MS - 100;
    const claim = timed('a', confident(10_000, endMs));
    const [marker] = claimMarkers([claim], 30_000);

    expect(marker.atMs).toBe(endMs);
    expect(marker.seekMs).toBeLessThan(30_000 - PLAYBACK_END_EPSILON_MS);
    expect(marker.seekMs).toBeGreaterThan(marker.atMs);
    expect(counted(claim, marker.seekMs)).toEqual(['a']);
  });

  // Every instant of a recording this short is already "the end", so there is nowhere to put the
  // viewer where the claim would be counted. No hash is the honest answer.
  it('draws nothing when the whole recording is inside that stretch', () => {
    expect(claimMarkers([timed('a', confident(0, 20))], 20)).toEqual([]);
  });

  it('seeks just inside the window rather than onto its edge', () => {
    const claim = timed('a', confident(10_000, 14_000));
    const [marker] = claimMarkers([claim], 100_000);

    expect(marker.atMs).toBe(14_000);
    expect(marker.seekMs).toBeGreaterThan(marker.atMs);
    // The whole point: the claim is counted where the click lands, and not a moment before.
    expect(counted(claim, marker.atMs - 1)).toEqual([]);
    expect(counted(claim, marker.seekMs)).toEqual(['a']);
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

  // The hash sits where the claim is counted; at its start it would point somewhere the claim has
  // not been counted yet.
  it('marks the end of the claim, where it is counted', () => {
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
  // matched loosely drew hashes that were nowhere near their claim — eight of them on one real
  // debate. A hash promises something is there, so it takes only firmly placed claims.
  it('leaves out a match too loose to place on the scrubber', () => {
    expect(claimMarkers([timed('loose', unsure(27_000, 31_000))], 270_000)).toEqual([]);
  });

  /**
   * Two claims can end on the same millisecond — `matchClaimWindow` places them on segment
   * boundaries, so any two matched to the same window do. Two hashes at one point means the later
   * covers the earlier and the first cannot be reached with a pointer, so they become one.
   */
  it('draws one hash for several claims that end on the same moment', () => {
    const markers = claimMarkers(
      [timed('a', confident(10_000, 30_000)), timed('b', confident(20_000, 30_000))],
      270_000
    );

    expect(markers).toHaveLength(1);
    expect(markers[0].count).toBe(2);
    // The last in spoken order survives, because that is the newest in the list — see below.
    expect(markers[0].id).toBe('b');
  });

  /**
   * The hash's label names the newest of the claims it stands for: the last of them in the
   * counter's list, nearest the counter when it opens.
   */
  it('names the newest claim when several share a moment', () => {
    const claims = [timed('a', confident(10_000, 30_000)), timed('b', confident(20_000, 30_000))];
    const [marker] = claimMarkers(claims, 270_000);
    const newest = claimHistory(backlogWindows(claims), marker.seekMs).at(-1);

    expect(newest?.window.claim.id).toBe(marker.id);
    expect(newest?.window.claim.text).toBe(marker.text);
  });

  /**
   * The invariant the hit-area maths leans on.
   *
   * `markerHitWidth` sizes each target by its distance to its nearest neighbour, and two markers on
   * one point make that zero — same `left`, same width, the later covering the earlier so one claim
   * cannot be pressed. The floor there keeps the button clickable; this keeps the case from
   * arising, and it is the only producer of `ClaimMarker[]`, so holding it here holds it.
   */
  it('never puts two hashes on the same point', () => {
    const claims = [
      timed('a', confident(10_000, 30_000)),
      timed('b', confident(20_000, 30_000)),
      timed('c', confident(40_000, 60_000)),
      timed('d', confident(50_000, 60_000)),
      timed('e', confident(70_000, 90_000)),
    ];
    const fractions = claimMarkers(claims, 270_000).map(marker => marker.fraction);

    expect(new Set(fractions).size).toBe(fractions.length);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  });

  it('counts a lone claim as standing for itself', () => {
    expect(claimMarkers([timed('a', confident(10_000, 30_000))], 270_000)[0].count).toBe(1);
  });

  it('draws nothing before the timeline is known', () => {
    expect(claimMarkers([timed('a', confident(1_000, 2_000))], 0)).toEqual([]);
  });
});

describe('speakersByClaimId', () => {
  const debate = {
    participants: [
      { participant_slot: 1, profile_space_id: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', display_name: 'Ada' },
      { participant_slot: 2, profile_space_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', display_name: 'Bo' },
    ],
  } as unknown as Debate;

  it("credits each claim to the author of the turn it was said in, whatever the id's spelling", () => {
    const speakers = speakersByClaimId(debate, {
      all: [
        { id: 'c1', blockId: 'turn-1' },
        { id: 'c2', blockId: 'turn-2' },
        { id: 'c3', blockId: 'turn-3' },
      ] as never,
      blocks: [
        { id: 'turn-1', authorSpaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', text: '' },
        { id: 'turn-2', authorSpaceId: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB', text: '' },
        // A turn by someone not in the debate, and one with no author at all.
        { id: 'turn-3', authorSpaceId: 'cccccccccccccccccccccccccccccccc', text: '' },
      ],
    });

    expect(speakers.get('c1')?.display_name).toBe('Ada');
    expect(speakers.get('c2')?.display_name).toBe('Bo');
    expect(speakers.has('c3')).toBe(false);
  });

  it('credits nobody with a claim restated across turns, since its turn is only the first of them', () => {
    // One entity linked from two turns — possibly by both debaters. The row keeps only the first
    // turn's block, so crediting that turn's author would put the other statement in their mouth.
    const speakers = speakersByClaimId(debate, {
      all: [{ id: 'c1', blockId: 'turn-1', restated: true }] as never,
      blocks: [{ id: 'turn-1', authorSpaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', text: '' }],
    });

    expect(speakers.has('c1')).toBe(false);
  });
});

describe('drawableClaims', () => {
  const speakers = new Map<string, DebateParticipant>([
    ['a', {}],
    ['b', {}],
    ['c', {}],
    ['d', {}],
  ] as never);
  const claimAt = (id: string, text: string, startMs: number, spaceId: string | null = 'space') =>
    ({ ...timed(id, confident(startMs, startMs + 1000), text), spaceId }) as TimedClaim;

  it('keeps only claims that can be credited to a debater and answered in a space', () => {
    const result = drawableClaims(
      [claimAt('a', 'One', 0), claimAt('b', 'Two', 1000, null), claimAt('unknown', 'Three', 2000)],
      speakers
    );
    expect(result.map(claim => claim.id)).toEqual(['a']);
  });

  it('collapses a claim published twice at the same moment, but not a claim repeated later', () => {
    const result = drawableClaims(
      [claimAt('a', 'Same words', 0), claimAt('b', ' same WORDS ', 0), claimAt('c', 'Same words', 5000)],
      speakers
    );
    expect(result.map(claim => claim.id)).toEqual(['a', 'c']);
  });
});
