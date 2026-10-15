import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimTiming } from './claim-timing';
import { RENDERED_TURN_SEGMENTS } from './open-rounds-media-fixtures';
import type { DebateTranscriptClaims, TranscriptClaim } from './transcript-claims';
import { useClaimTimings } from './use-claim-timings';

const transcript = vi.hoisted(() => ({
  calls: [] as { debateId: string; enabled: boolean }[],
  state: { data: undefined as unknown, isSuccess: false, isError: false },
  media: undefined as unknown,
  mediaEnabled: [] as boolean[],
  mediaSettled: true,
}));

vi.mock('./hooks', () => ({
  useDebateMedia: (_id: string, enabled: boolean) => {
    transcript.mediaEnabled.push(enabled);
    return {
      data: transcript.mediaSettled ? transcript.media : undefined,
      isPending: !transcript.mediaSettled,
      isLoading: !transcript.mediaSettled,
      isSuccess: transcript.mediaSettled,
      isError: false,
      error: null,
    };
  },
  useDebateTranscript: (debateId: string, _format: string, enabled: boolean) => {
    transcript.calls.push({ debateId, enabled });
    return transcript.state;
  },
}));

const published = (startMs: number, endMs: number): ClaimTiming => ({
  startMs,
  endMs,
  confidence: 1,
  source: 'published',
});

function claim(id: string, publishedTiming: ClaimTiming | null): TranscriptClaim {
  return {
    id,
    text: `Claim ${id}`,
    spaceId: 'space-1',
    blockId: 'block-1',
    relationEntityId: `relation-${id}`,
    publishedTiming,
  } as TranscriptClaim;
}

function claims(all: TranscriptClaim[]): DebateTranscriptClaims {
  return {
    all,
    byAuthorSpaceId: new Map(),
    unattributed: [],
    blocks: [{ id: 'block-1', text: 'Claim a and claim b', authorSpaceId: null }],
    totalCount: all.length,
  } as unknown as DebateTranscriptClaims;
}

const lastCall = () => transcript.calls.at(-1);

describe('useClaimTimings', () => {
  beforeEach(() => {
    transcript.calls = [];
    transcript.state = { data: undefined, isSuccess: false, isError: false };
    transcript.media = undefined;
    transcript.mediaEnabled = [];
    transcript.mediaSettled = true;
  });

  // Timecodes published to the graph are the edited video's; the player plays the raw recordings,
  // so each is placed by the turn it falls in, from the turn's two served positions (GEO-3293).
  it('places each claim on the recordings the player plays, not the edited video', () => {
    // The Preston vs Adam render: turn 2 is at 121.6 s in the video and 128 s in the recordings.
    transcript.media = { turn_segments: RENDERED_TURN_SEGMENTS };
    const { result } = renderHook(() =>
      useClaimTimings(
        'debate-1',
        claims([claim('a', published(10_000, 12_000)), claim('b', published(130_000, 134_000))])
      )
    );

    expect(result.current.timings.get('a')).toMatchObject({ startMs: 10_000, endMs: 12_000 });
    expect(result.current.timings.get('b')).toMatchObject({ startMs: 136_400, endMs: 140_400 });
  });

  /**
   * The point of the whole hook once the backend publishes offsets natively (GEO-2958): there is
   * nothing left for the transcript to tell us, so it is not asked for.
   */
  it('does not fetch the transcript when every claim already carries its offsets', () => {
    const { result } = renderHook(() =>
      useClaimTimings('debate-1', claims([claim('a', published(0, 1_000)), claim('b', published(2_000, 3_000))]))
    );

    expect(lastCall()?.enabled).toBe(false);
    // And the published moments still resolve — the transcript was never the source for those.
    expect(result.current.timings.get('a')).toMatchObject({ startMs: 0, endMs: 1_000, source: 'published' });
    expect(result.current.isReady).toBe(true);
  });

  it('fetches it when even one claim is unplaced', () => {
    renderHook(() => useClaimTimings('debate-1', claims([claim('a', published(0, 1_000)), claim('b', null)])));

    expect(lastCall()?.enabled).toBe(true);
  });

  it('asks for nothing with no claims, no debate, or while disabled', () => {
    renderHook(() => useClaimTimings('debate-1', claims([])));
    expect(lastCall()?.enabled).toBe(false);

    renderHook(() => useClaimTimings(null, claims([claim('a', null)])));
    expect(lastCall()?.enabled).toBe(false);

    renderHook(() => useClaimTimings('debate-1', claims([claim('a', null)]), false));
    expect(lastCall()?.enabled).toBe(false);
  });

  /**
   * A surface that reorders by time waits on `isReady`, so anything that leaves it false forever
   * leaves that surface empty forever. A failed transcript is an answer: the published timings
   * resolved, and the rest are not coming.
   */
  it('is ready once a needed transcript fails, not only when it succeeds', () => {
    transcript.state = { data: undefined, isSuccess: false, isError: false };
    const pending = renderHook(() => useClaimTimings('debate-1', claims([claim('a', null)])));
    expect(pending.result.current.isReady).toBe(false);

    transcript.state = { data: undefined, isSuccess: false, isError: true };
    const failed = renderHook(() => useClaimTimings('debate-1', claims([claim('a', null)])));
    expect(failed.result.current.isReady).toBe(true);
  });

  it('is ready immediately when no transcript is needed', () => {
    const { result } = renderHook(() => useClaimTimings('debate-1', claims([claim('a', published(0, 1_000))])));

    expect(result.current.isReady).toBe(true);
  });

  // The claims panel and activity rows read this for every debate. Only a published timecode needs
  // the media, so a debate without one asks for nothing new.
  it('asks for the media only when a claim carries a published timecode', () => {
    renderHook(() => useClaimTimings('debate-1', claims([claim('a', null), claim('b', null)])));
    expect(transcript.mediaEnabled.at(-1)).toBe(false);

    renderHook(() => useClaimTimings('debate-1', claims([claim('a', published(0, 1_000)), claim('b', null)])));
    expect(transcript.mediaEnabled.at(-1)).toBe(true);
  });

  // Copilot, #2843: while the media is still coming, a published time is on the edited clock and
  // would place the claim early, then move it. It is held back until the media answers.
  it('holds a published timing back until the media that places it has answered', () => {
    transcript.media = { turn_segments: RENDERED_TURN_SEGMENTS };
    transcript.mediaSettled = false;
    const input = claims([claim('b', published(130_000, 134_000))]);
    const { result, rerender } = renderHook(() => useClaimTimings('debate-1', input));
    expect(result.current.timings.has('b')).toBe(false);
    expect(result.current.isReady).toBe(false);

    transcript.mediaSettled = true;
    rerender();
    expect(result.current.timings.get('b')).toMatchObject({ startMs: 136_400, endMs: 140_400 });
    expect(result.current.isReady).toBe(true);
  });
});
