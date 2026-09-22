import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimTiming } from './claim-timing';
import type { DebateTranscriptClaims, TranscriptClaim } from './transcript-claims';
import { useClaimTimings } from './use-claim-timings';

const transcript = vi.hoisted(() => ({
  calls: [] as { debateId: string; enabled: boolean }[],
  state: { data: undefined as unknown, isSuccess: false, isError: false },
}));

vi.mock('./hooks', () => ({
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
});
