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
  claims: [{ text: 'A high body count says something about a person' }, { text: 'Second claim' }],
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
      captions: [
        { startMs: 80, endMs: 2940, text: "I also think there's this funny quote" },
        { startMs: 2940, endMs: 6780, text: 'which is, it can also be something that' },
      ],
    });
    expect(second).toMatchObject({ id: 'clip-2', participantSlot: 2, captions: [], debateStartMs: 84330 });
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

  it('picks the full debate up where the viewer was in the moment, never past its end', () => {
    expect(debateTimeForMoment(first)).toBe(26330);
    expect(debateTimeForMoment(first, 4000)).toBe(30330);
    expect(debateTimeForMoment(first, 60_000)).toBe(53690);
    expect(debateTimeForMoment({ ...first, debateStartMs: null })).toBeNull();
  });

  it('places a dot per moment along a known length', () => {
    const moments = decodeDebateMoments(payload, BASE);
    expect(momentMarkers(moments, 200_000)).toEqual([
      { momentIndex: 0, fraction: 26330 / 200_000 },
      { momentIndex: 1, fraction: 84330 / 200_000 },
    ]);
    expect(momentMarkers(moments, 50_000)).toEqual([{ momentIndex: 0, fraction: 26330 / 50_000 }]);
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
