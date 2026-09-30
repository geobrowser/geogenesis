import { describe, expect, it } from 'vitest';

import type { Debate, DebateMediaTurnSegment, DebateTranscriptSegment } from './api';
import type { DebateTranscriptClaims, TranscriptClaim } from './transcript-claims';
import { warehouseClaims, warehouseTurns } from './warehouse';

const debate = {
  id: 'DE-BATE',
  turn_durations_ms: [60_000, 60_000, 45_000, 45_000, 30_000, 30_000],
  participants: [
    { participant_slot: 1, profile_space_id: 'SPEAKER-A' },
    { participant_slot: 2, profile_space_id: 'speaker-b' },
  ],
} as Debate;
const media = [0, 1, 2, 3, 4, 5].map(i => ({
  turn_index: i,
  participant_slot: (i % 2) + 1,
  output_start_ms: i * 10_000,
  output_end_ms: (i + 1) * 10_000,
  countdown_start_ms: i * 10_000 + 500,
  duration_ms: 10_000,
})) as DebateMediaTurnSegment[];
const turns = warehouseTurns(debate, media);
const claim = {
  id: 'CLAIM-ID',
  text: 'Solar power reduces pollution',
  blockId: 'block',
  spaceId: 'space',
  publishedTiming: null,
  relationEntityId: 'relation',
  restated: false,
} satisfies TranscriptClaim;
const claims = (overrides: Partial<TranscriptClaim> = {}): DebateTranscriptClaims => ({
  all: [{ ...claim, ...overrides }],
  byAuthorSpaceId: new Map(),
  unattributed: [],
  totalCount: 1,
  blocks: [{ id: 'block', authorSpaceId: 'speaker-a', text: 'Solar power reduces pollution' }],
});
const segments = [
  { start_ms: 21_000, end_ms: 25_000, text: 'Solar power reduces pollution', sequence_index: 0 },
] as DebateTranscriptSegment[];

describe('warehouse debate timing', () => {
  it('uses rendered boundaries, not planned durations or countdown, and the app round rules', () => {
    expect(turns.map(t => t.round)).toEqual(['opening', 'opening', 'rebuttal', 'rebuttal', 'closing', 'closing']);
    expect(turns[2]).toMatchObject({
      debate_id: 'debate',
      start_ms: 20_000,
      end_ms: 30_000,
      speaker_space_id: 'speakera',
    });
    expect(warehouseTurns({ ...debate, turn_durations_ms: [1, 1, 1, 1] }, media.slice(0, 4))[2].round).toBe('rebuttal');
  });
  it('rejects overlaps, duplicate indices and missing speakers', () => {
    expect(() => warehouseTurns(debate, [media[0], media[0]])).toThrow();
    expect(() => warehouseTurns(debate, [media[0], { ...media[1], output_start_ms: 9_999 }])).toThrow();
    expect(() => warehouseTurns({ ...debate, participants: [] }, media)).toThrow();
  });
  it('prefers exact offsets and assigns a boundary to the incoming turn', () => {
    expect(
      warehouseClaims(
        'DE-BATE',
        'SP-ACE',
        claims({ publishedTiming: { startMs: 20_000, endMs: 22_000 } }),
        segments,
        turns
      )[0]
    ).toMatchObject({
      claim_id: 'claimid',
      publication_space_id: 'space',
      timing_source: 'exact',
      confidence: 1,
      turn_index: 2,
    });
  });
  it('uses the shared transcript matcher and exposes its confidence', () => {
    expect(warehouseClaims('debate', 'space', claims(), segments, turns)[0]).toMatchObject({
      timing_source: 'matched',
      confidence: 1,
      round: 'rebuttal',
    });
  });
  it('falls back to the source block when claim wording cannot be matched', () => {
    expect(
      warehouseClaims('debate', 'space', claims({ text: 'Entirely unrelated wording' }), segments, turns)[0]
    ).toMatchObject({ timing_source: 'turn_only', confidence: 0, start_ms: 21_000, round: 'rebuttal' });
  });
  it('keeps unknown timing explicit, rather than assigning it to zero', () => {
    expect(warehouseClaims('debate', 'space', claims(), [], turns)[0]).toMatchObject({
      timing_source: 'unknown',
      start_ms: null,
      round: 'unknown',
      speaker_space_id: '',
    });
  });
  it('does not attribute conflicting authors or positions beyond the recording', () => {
    for (const startMs of [10_000, 60_000]) {
      expect(
        warehouseClaims('debate', 'space', claims({ publishedTiming: { startMs, endMs: startMs + 100 } }), [], turns)[0]
      ).toMatchObject({ round: 'unknown', speaker_space_id: '', timing_source: 'exact' });
    }
  });
});
