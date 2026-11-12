import { describe, expect, it } from 'vitest';

import {
  type DebateMoment,
  debateTimeForMoment,
  decodeDebateMoments,
  formatPlaybackTime,
  fullDebateVideoUrl,
  momentCaptionAt,
  momentMarkers,
} from './debate-moments';

const BASE = 'https://chat-api.test';
const DEBATE = '01a0b080-9a14-7c71-887b-d65ea3df4706';

/** Shaped like testnet's `GET /debates/{id}/claims` for this debate, 11 Nov 2026, trimmed. */
const payload = {
  claims: [
    { text: 'A high body count says something about a person', clip_start_ms: 8530, clip_end_ms: 14380 },
    // A picked moment: the claim's own clip range, widened by its edge room when the file was cut.
    { text: 'Second claim', clip_start_ms: 84330, clip_end_ms: 98240, clip_lead_ms: 180, clip_tail_ms: 250 },
  ],
  // A story reel (GEO-3638) serves its own cut beside the list: moment 0 is one of its moments.
  story_moments: [
    { moment_index: 0, clip_start_ms: 26330, clip_end_ms: 53690, cut_start_ms: 26250, cut_end_ms: 53940 },
  ],
  moments: [
    {
      byte_size: 703623,
      claim_index: 0,
      clip_end_ms: 53690,
      clip_start_ms: 26330,
      clip_url: `/debates/${DEBATE}/moments/01a1c97f-a272-7a43-9ef6-717c39d9a3d7/content`,
      content_type: 'video/mp4',
      duration_ms: 27690,
      entity_id: null,
      height: 578,
      moment_index: 0,
      participant_slot: 1,
      subtitles: [
        { start_ms: 80, end_ms: 2940, text: "I also think there's this funny quote" },
        { start_ms: 2940, end_ms: 6780, text: '  which is, it can also be something that ' },
        { start_ms: 7000, end_ms: 8000, text: '   ' },
      ],
      width: 480,
    },
    {
      claim_index: 1,
      clip_end_ms: 98240,
      clip_start_ms: 84330,
      clip_url: `/debates/${DEBATE}/moments/clip-2/content`,
      duration_ms: 14405,
      moment_index: 1,
      participant_slot: 2,
      subtitles: null,
    },
  ],
};

describe('decodeDebateMoments', () => {
  it('maps the claims payload to playable moments with clip times and captions', () => {
    const [first, second] = decodeDebateMoments(payload, BASE);

    expect(first).toEqual({
      id: '01a1c97f-a272-7a43-9ef6-717c39d9a3d7',
      momentIndex: 0,
      claimIndex: 0,
      claimText: 'A high body count says something about a person',
      participantSlot: 1,
      clipUrl: `${BASE}/debates/${DEBATE}/moments/01a1c97f-a272-7a43-9ef6-717c39d9a3d7/content`,
      durationMs: 27690,
      debateStartMs: 26330,
      debateEndMs: 53690,
      cutStartMs: 26250,
      cutEndMs: 53940,
      captions: [
        { startMs: 80, endMs: 2940, text: "I also think there's this funny quote" },
        { startMs: 2940, endMs: 6780, text: 'which is, it can also be something that' },
      ],
    });
    expect(second).toMatchObject({
      id: 'clip-2',
      participantSlot: 2,
      captions: [],
      debateStartMs: 84330,
      cutStartMs: 84330 - 180,
      cutEndMs: 98240 + 250,
    });
  });

  it("places a clip file's start in the debate: the story's cut, else the claim's lead, else the default pad", () => {
    const [noClaimRange, otherRange, zeroLead] = decodeDebateMoments(
      {
        claims: [
          { text: 'a' },
          { text: 'b', clip_start_ms: 1000, clip_end_ms: 2000, clip_lead_ms: 50 },
          { text: 'c', clip_start_ms: 40_000, clip_end_ms: 50_000, clip_lead_ms: 0, clip_tail_ms: null },
        ],
        moments: [
          { moment_index: 0, claim_index: 0, clip_url: '/a', clip_start_ms: 10_000, clip_end_ms: 20_000 },
          // A range that is not the claim's (a story re-cut) borrows nothing from the claim.
          { moment_index: 1, claim_index: 1, clip_url: '/b', clip_start_ms: 30_000, clip_end_ms: 35_000 },
          { moment_index: 2, claim_index: 2, clip_url: '/c', clip_start_ms: 40_000, clip_end_ms: 50_000 },
        ],
      },
      BASE
    );
    expect([noClaimRange.cutStartMs, noClaimRange.cutEndMs]).toEqual([9750, 20_250]);
    expect([otherRange.cutStartMs, otherRange.cutEndMs]).toEqual([29_750, 35_250]);
    // A claim without lead or tail was cut at its own edges: geo-chat reads a missing one as 0.
    expect([zeroLead.cutStartMs, zeroLead.cutEndMs]).toEqual([40_000, 50_000]);
  });

  it('cuts a claim with no edge fields at its own range', () => {
    const [moment] = decodeDebateMoments(
      {
        claims: [{ text: 'old', clip_start_ms: 40_000, clip_end_ms: 50_000 }],
        moments: [{ moment_index: 0, claim_index: 0, clip_url: '/a', clip_start_ms: 40_000, clip_end_ms: 50_000 }],
      },
      BASE
    );
    expect([moment.cutStartMs, moment.cutEndMs]).toEqual([40_000, 50_000]);
  });

  it('drops entries it cannot play and keeps the rest, in play order', () => {
    const moments = decodeDebateMoments(
      {
        claims: [],
        moments: [
          { moment_index: 2, claim_index: 4, clip_url: 'https://cdn.test/c.mp4', clip_start_ms: 9000 },
          null,
          { moment_index: 1, claim_index: 0, clip_url: '' },
          { moment_index: 'x', claim_index: 0, clip_url: '/a' },
          { moment_index: 0, claim_index: 3, clip_url: '/debates/d/moments/a/content', clip_start_ms: -5 },
        ],
      },
      `${BASE}/`
    );

    expect(moments.map(m => m.momentIndex)).toEqual([0, 2]);
    // An absolute URL stays as it is; a relative one is joined to the base once, without `//`.
    expect(moments[1].clipUrl).toBe('https://cdn.test/c.mp4');
    expect(moments[0].clipUrl).toBe(`${BASE}/debates/d/moments/a/content`);
    // A claim the payload no longer lists, and a nonsense start, cost only those fields.
    expect(moments[1].claimText).toBeNull();
    expect(moments[0].debateStartMs).toBeNull();
  });

  it('is empty for a debate without a reel, an older payload, or no payload', () => {
    expect(decodeDebateMoments({ claims: [{ text: 'a' }], moments: [] }, BASE)).toEqual([]);
    expect(decodeDebateMoments({ claims: [{ text: 'a' }] }, BASE)).toEqual([]);
    expect(decodeDebateMoments(null, BASE)).toEqual([]);
  });
});

describe('moment helpers', () => {
  const [first] = decodeDebateMoments(payload, BASE) as [DebateMoment, DebateMoment];

  it('finds the caption on screen, and none in a gap', () => {
    expect(momentCaptionAt(first.captions, 100)).toBe("I also think there's this funny quote");
    expect(momentCaptionAt(first.captions, 2940)).toBe('which is, it can also be something that');
    expect(momentCaptionAt(first.captions, 10)).toBeNull();
  });

  it('picks the full debate up where the viewer was in the clip file, which starts at the cut', () => {
    // Clip position 80 ms is the first caption's first word, said at 26 330 ms in the debate.
    expect(debateTimeForMoment(first, 80)).toBe(26330);
    expect(debateTimeForMoment(first)).toBe(26250);
    expect(debateTimeForMoment(first, 4000)).toBe(30250);
    expect(debateTimeForMoment(first, 60_000)).toBe(53940);
    expect(debateTimeForMoment({ ...first, cutStartMs: null })).toBeNull();
  });

  it('places a dot per moment along a known length', () => {
    const moments = decodeDebateMoments(payload, BASE);
    expect(momentMarkers(moments, 200_000)).toEqual([
      { momentIndex: 0, fraction: 26250 / 200_000 },
      { momentIndex: 1, fraction: 84150 / 200_000 },
    ]);
    expect(momentMarkers(moments, 50_000)).toEqual([{ momentIndex: 0, fraction: 26250 / 50_000 }]);
    expect(momentMarkers(moments, 0)).toEqual([]);
  });

  it('builds the public full-debate URL and formats times', () => {
    expect(fullDebateVideoUrl(DEBATE, `${BASE}/`)).toBe(
      `${BASE}/debates/${DEBATE}/media/artifacts/final_video/content`
    );
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(65_400)).toBe('1:05');
    expect(formatPlaybackTime(3_725_000)).toBe('1:02:05');
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
  });
});
