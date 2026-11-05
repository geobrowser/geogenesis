import { describe, expect, it } from 'vitest';

import { type DebateMoment, decodeDebateMoments, momentSubtitleAt, topMoment } from './moments';
import type { DebateExtractedClaimsResponse, DebateExtractedMoment } from './server/extracted-claims';

const BASE = 'https://chat.example';

function rawMoment(overrides: Partial<DebateExtractedMoment> = {}): DebateExtractedMoment {
  return {
    moment_index: 0,
    claim_index: 0,
    entity_id: 'e0',
    participant_slot: 1,
    clip_start_ms: 4_923,
    clip_end_ms: 19_643,
    duration_ms: 14_760,
    clip_url: '/debates/d1/moments/clip-0/content',
    content_type: 'video/mp4',
    byte_size: 398_894,
    width: 480,
    height: 578,
    subtitles: [{ start_ms: 40, end_ms: 3_700, text: "I'm going to define convert" }],
    ...overrides,
  };
}

function payload(
  moments: DebateExtractedMoment[] | null | undefined,
  scores: (number | null)[] = []
): Pick<DebateExtractedClaimsResponse, 'claims' | 'moments'> {
  return {
    moments,
    claims: scores.map((score, index) => ({
      text: `claim ${index}`,
      is_factual: null,
      turn_index: 0,
      moment_score: score,
    })),
  };
}

const moment = (momentIndex: number, score: number | null): DebateMoment => ({
  id: `clip-${momentIndex}`,
  momentIndex,
  claimIndex: momentIndex,
  claimText: null,
  score,
  participantSlot: 1,
  clipUrl: `${BASE}/clip-${momentIndex}`,
  durationMs: 12_000,
  subtitles: [],
});

describe('decodeDebateMoments', () => {
  it('reads each moment with its claim, its score and an absolute clip URL', () => {
    const [decoded] = decodeDebateMoments(payload([rawMoment()], [0.86]), BASE);

    expect(decoded).toEqual({
      id: 'clip-0',
      momentIndex: 0,
      claimIndex: 0,
      claimText: 'claim 0',
      score: 0.86,
      participantSlot: 1,
      clipUrl: `${BASE}/debates/d1/moments/clip-0/content`,
      durationMs: 14_760,
      subtitles: [{ startMs: 40, endMs: 3_700, text: "I'm going to define convert" }],
    });
  });

  it('is empty for a payload from before moments, or with an empty list', () => {
    expect(decodeDebateMoments(payload(undefined), BASE)).toEqual([]);
    expect(decodeDebateMoments(payload(null), BASE)).toEqual([]);
    expect(decodeDebateMoments(payload([]), BASE)).toEqual([]);
    expect(decodeDebateMoments(null, BASE)).toEqual([]);
  });

  it('drops an entry with no clip rather than the whole list', () => {
    const decoded = decodeDebateMoments(
      payload([rawMoment({ clip_url: '' }), rawMoment({ moment_index: 1, claim_index: 1 })], [0.9, 0.5]),
      BASE
    );

    expect(decoded.map(entry => entry.momentIndex)).toEqual([1]);
  });

  it('leaves a moment unscored when its claim has no score', () => {
    expect(decodeDebateMoments(payload([rawMoment()], [null]), BASE)[0]?.score).toBeNull();
    expect(decodeDebateMoments(payload([rawMoment()], []), BASE)[0]?.score).toBeNull();
  });

  it('drops malformed subtitle cues', () => {
    const [decoded] = decodeDebateMoments(
      payload(
        [
          rawMoment({
            subtitles: [
              { start_ms: 0, end_ms: 1_000, text: ' ok ' },
              { start_ms: 1_000, end_ms: 2_000, text: '' },
              { start_ms: 'x', end_ms: 3_000, text: 'bad' } as never,
            ],
          }),
        ],
        [1]
      ),
      BASE
    );

    expect(decoded?.subtitles).toEqual([{ startMs: 0, endMs: 1_000, text: 'ok' }]);
  });
});

describe('topMoment', () => {
  it('picks the highest score, not index 0', () => {
    // geo-chat dropped the lead moment's file, so index 0 is gone and the list is in time order.
    expect(topMoment([moment(1, 0.5), moment(2, 0.9), moment(3, 0.7)])?.momentIndex).toBe(2);
  });

  it('breaks a tie on the lower moment index', () => {
    expect(topMoment([moment(3, 0.8), moment(1, 0.8)])?.momentIndex).toBe(1);
  });

  it('ranks unscored moments below scored ones, and falls back to list order with no scores', () => {
    expect(topMoment([moment(0, null), moment(1, 0.1)])?.momentIndex).toBe(1);
    expect(topMoment([moment(2, null), moment(0, null)])?.momentIndex).toBe(0);
  });

  it('is null with no moments', () => {
    expect(topMoment([])).toBeNull();
  });
});

describe('momentSubtitleAt', () => {
  const cues = [
    { startMs: 0, endMs: 1_000, text: 'one' },
    { startMs: 1_500, endMs: 2_500, text: 'two' },
  ];

  it('is the cue on screen, and nothing in a gap', () => {
    expect(momentSubtitleAt(cues, 500)).toBe('one');
    expect(momentSubtitleAt(cues, 1_200)).toBeNull();
    expect(momentSubtitleAt(cues, 1_500)).toBe('two');
    expect(momentSubtitleAt(cues, 2_500)).toBeNull();
  });
});
