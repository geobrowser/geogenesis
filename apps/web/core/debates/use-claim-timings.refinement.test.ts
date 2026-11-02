import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateMediaTurnSegment, DebateTranscriptSegment } from './api';
import type { DebateTranscriptClaims, TranscriptClaim } from './transcript-claims';
import { useClaimTimings } from './use-claim-timings';

const mocks = vi.hoisted(() => ({
  transcript: {
    data: undefined as { segments: DebateTranscriptSegment[] } | undefined,
    isSuccess: false,
    isError: false,
  },
  media: {
    data: undefined as { turn_segments: DebateMediaTurnSegment[] } | undefined,
    isSuccess: false,
    isError: false,
  },
  transcriptEnabled: false,
  mediaEnabled: false,
}));
vi.mock('./hooks', () => ({
  useDebateTranscript: (_id: string, _format: string, enabled: boolean) => {
    mocks.transcriptEnabled = enabled;
    return mocks.transcript;
  },
  useDebateMedia: (_id: string, enabled: boolean) => {
    mocks.mediaEnabled = enabled;
    return mocks.media;
  },
}));

const statements = [
  'Farm labor shortages hurt growers.',
  'Food prices are rising.',
  'Truckers refuse routes through states.',
];
const claims: DebateTranscriptClaims = {
  all: statements.map((text, index) => ({
    id: `claim-${index}`,
    text,
    blockId: 'turn-1',
    spaceId: 'space-1',
    publishedTiming: { startMs: 0, endMs: 9_000 },
    restated: false,
    relationEntityId: null,
    highlightScore: null,
    relevanceScore: null,
    qualityScore: null,
    controversyScore: null,
  })),
  blocks: [],
  unattributed: [],
  totalCount: statements.length,
  byAuthorSpaceId: new Map(),
};
const segments = statements.map(
  (text, index) =>
    ({
      text,
      start_ms: index * 3_000,
      end_ms: (index + 1) * 3_000,
      source_start_ms: 10_000 + index * 3_000,
      source_end_ms: 10_000 + (index + 1) * 3_000,
    }) as DebateTranscriptSegment
);
const turns: DebateMediaTurnSegment[] = [
  {
    turn_index: 0,
    participant_slot: 1,
    output_start_ms: 0,
    output_end_ms: 9_000,
    source_start_ms: 10_000,
    source_end_ms: 19_000,
    duration_ms: 9_000,
  },
];
beforeEach(() => {
  mocks.transcript = { data: { segments }, isSuccess: true, isError: false };
  mocks.media = { data: { turn_segments: turns }, isSuccess: true, isError: false };
  mocks.transcriptEnabled = false;
  mocks.mediaEnabled = false;
});

describe('claim timing query and refinement', () => {
  it('uses the cached transcript to split grouped published paragraphs after mapping both clocks', () => {
    const { result } = renderHook(() => useClaimTimings('debate-1', claims));
    expect(mocks.transcriptEnabled).toBe(true);
    expect(mocks.mediaEnabled).toBe(true);
    expect([...result.current.timings.values()].map(timing => timing.endMs)).toEqual([13_000, 16_000, 19_000]);
    expect(result.current.isReady).toBe(true);
  });

  it('holds grouped timings while the transcript loads instead of publishing a batch then moving it backwards', () => {
    mocks.transcript = { data: undefined, isSuccess: false, isError: false };
    const { result, rerender } = renderHook(() => useClaimTimings('debate-1', claims));
    expect(result.current.timings.size).toBe(0);
    expect(result.current.isReady).toBe(false);
    mocks.transcript = { data: { segments }, isSuccess: true, isError: false };
    rerender();
    expect([...result.current.timings.values()].map(timing => timing.endMs)).toEqual([13_000, 16_000, 19_000]);
    expect(result.current.isReady).toBe(true);
  });

  it('waits for the media to establish the recordings clock before refining', () => {
    mocks.media = { data: undefined, isSuccess: false, isError: false };
    const { result, rerender } = renderHook(() => useClaimTimings('debate-1', claims));
    expect(result.current.timings.size).toBe(0);
    expect(result.current.isReady).toBe(false);
    mocks.media = { data: { turn_segments: turns }, isSuccess: true, isError: false };
    rerender();
    expect([...result.current.timings.values()].map(timing => timing.endMs)).toEqual([13_000, 16_000, 19_000]);
  });

  it('keeps the published fallback on a transcript failure, without hanging readiness', () => {
    mocks.transcript = { data: undefined, isSuccess: false, isError: true };
    const { result } = renderHook(() => useClaimTimings('debate-1', claims));
    expect([...result.current.timings.values()].map(timing => timing.endMs)).toEqual([19_000, 19_000, 19_000]);
    expect(result.current.isReady).toBe(true);
  });

  it('does not compare source-clock transcript lines against unmapped offsets on a media failure', () => {
    mocks.media = { data: undefined, isSuccess: false, isError: true };
    const { result } = renderHook(() => useClaimTimings('debate-1', claims));
    expect([...result.current.timings.values()].map(timing => timing.endMs)).toEqual([9_000, 9_000, 9_000]);
    expect(result.current.isReady).toBe(true);
  });

  it('does not request a transcript or change precise independent published timings', () => {
    const independent = {
      ...claims,
      all: claims.all.map(
        (claim, index) =>
          ({
            ...claim,
            publishedTiming: { startMs: index * 3_000, endMs: (index + 1) * 3_000 },
          }) as TranscriptClaim
      ),
    };
    const { result } = renderHook(() => useClaimTimings('debate-1', independent));
    expect(mocks.transcriptEnabled).toBe(false);
    expect([...result.current.timings.values()].map(timing => timing.endMs)).toEqual([13_000, 16_000, 19_000]);
    expect([...result.current.timings.values()].every(timing => timing.source === 'published')).toBe(true);
  });
});
