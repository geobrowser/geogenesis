import { act, renderHook, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateMediaTurnSegment } from './api';
import { useDebatePlayback } from './use-debate-playback';

const mocks = vi.hoisted(() => ({ recordingUrl: vi.fn(), turnSegments: [] as DebateMediaTurnSegment[] }));

// The hook imports exactly these three from './hooks'. Mocking the module blanks everything
// else in it, so anything omitted here arrives as undefined.
vi.mock('./hooks', () => ({
  useRecordingUrl: () => ({ mutateAsync: mocks.recordingUrl }),
  useDebateTranscript: () => ({ data: { segments: [] }, isLoading: false, error: null }),
  useDebateMedia: () => ({ data: { turn_segments: mocks.turnSegments }, isLoading: false, error: null }),
}));

function debateFixture(id = 'debate-1'): Debate {
  return {
    id,
    started_at: new Date(1_700_000_000_000).toISOString(),
    first_participant_slot: 1,
    turn_durations_ms: [30_000, 30_000],
    participants: [
      { participant_slot: 1, profile_space_id: 'space-1' },
      { participant_slot: 2, profile_space_id: 'space-2' },
    ],
    recordings: [
      { participant_slot: 1, filename: 'slot1.webm', started_at_ms: 1_700_000_000_000 },
      { participant_slot: 2, filename: 'slot2.webm', started_at_ms: 1_700_000_000_000 },
    ],
  } as unknown as Debate;
}

describe('useDebatePlayback — playback URLs survive re-activation (GEO-2895)', () => {
  beforeEach(() => {
    mocks.turnSegments = [];
    mocks.recordingUrl.mockReset();
    mocks.recordingUrl.mockImplementation(({ filename }: { filename: string }) =>
      Promise.resolve({ url: `https://cdn.test/${filename}?sig=abc` })
    );
  });

  it('fetches both slot URLs once when the card becomes active', async () => {
    const { result } = renderHook(({ active }) => useDebatePlayback(debateFixture(), active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    expect(result.current.urls.slot2).not.toBeNull();
    expect(mocks.recordingUrl).toHaveBeenCalledTimes(2); // one per slot
  });

  // THE REGRESSION. `active` flips whenever the card crosses the viewport threshold, and the
  // effect used to open with setUrls({slot1: null, slot2: null}) on every flip — blanking the
  // <video> back to the "Loading…" placeholder and re-requesting two signed URLs. That is the
  // flicker. `useRecordingUrl` is a mutation, so nothing upstream de-duplicates the requests.
  it('does NOT refetch or blank when the card is scrolled past and returns', async () => {
    const debate = debateFixture();
    const { result, rerender } = renderHook(({ active }) => useDebatePlayback(debate, active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    const settled = result.current.urls;
    expect(mocks.recordingUrl).toHaveBeenCalledTimes(2);

    rerender({ active: false }); // scrolled away
    rerender({ active: true }); // scrolled back
    rerender({ active: false });
    rerender({ active: true });

    // Same URL objects, never blanked — so `src` never goes null and "Loading…" never returns.
    expect(result.current.urls.slot1).toBe(settled.slot1);
    expect(result.current.urls.slot2).toBe(settled.slot2);
    expect(mocks.recordingUrl).toHaveBeenCalledTimes(2);
  });

  it('does refetch when the debate actually changes', async () => {
    const { result, rerender } = renderHook(({ debate }) => useDebatePlayback(debate, true), {
      initialProps: { debate: debateFixture('debate-1') },
    });

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    expect(mocks.recordingUrl).toHaveBeenCalledTimes(2);

    rerender({ debate: debateFixture('debate-2') });

    await waitFor(() => expect(mocks.recordingUrl).toHaveBeenCalledTimes(4));
  });

  it('a failed fetch can be retried on the next activation', async () => {
    mocks.recordingUrl.mockRejectedValueOnce(new Error('signing failed'));
    mocks.recordingUrl.mockRejectedValueOnce(new Error('signing failed'));

    const debate = debateFixture();
    const { result, rerender } = renderHook(({ active }) => useDebatePlayback(debate, active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    // Without releasing the key on failure the card would sit on "Loading…" forever.
    rerender({ active: false });
    rerender({ active: true });

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
  });
});

/**
 * A fake <video> that models the one browser behaviour this race depends on: calling
 * `pause()` while a `play()` promise is still pending rejects that promise and leaves the
 * element paused. Without modelling that, an interrupted resume looks like a successful one
 * and the race under test cannot happen.
 */
function fakeVideo() {
  const video = {
    paused: true,
    // Both muted, so playBothWithMutedFallback takes the no-audio path and does not spend a
    // second confirm round retrying muted.
    muted: true,
    currentTime: 0,
    playbackRate: 1,
    pending: null as null | { resolve: () => void; reject: (reason: unknown) => void },
    play() {
      return new Promise<void>((resolve, reject) => {
        video.pending = { resolve, reject };
      });
    },
    pause() {
      video.paused = true;
      video.pending?.reject(new Error('The play() request was interrupted by a call to pause()'));
      video.pending = null;
    },
    /**
     * Reject the in-flight play() without pausing — what an autoplay-policy block looks like.
     * Distinct from pause(): nothing superseded this attempt, so it must still be reported.
     */
    rejectPlay() {
      video.pending?.reject(new Error('play() failed because the user agent does not allow it'));
      video.pending = null;
    },
    /** Let the in-flight play() succeed, as the browser would once the media starts. */
    settlePlay() {
      if (!video.pending) return;
      video.paused = false;
      video.pending.resolve();
      video.pending = null;
    },
  };
  return video as unknown as HTMLVideoElement & { settlePlay: () => void; rejectPlay: () => void };
}

describe('useDebatePlayback — an interrupted resume must not report failure (GEO-2895)', () => {
  beforeEach(() => {
    mocks.recordingUrl.mockReset();
    mocks.recordingUrl.mockImplementation(({ filename }: { filename: string }) =>
      Promise.resolve({ url: `https://cdn.test/${filename}?sig=abc` })
    );
  });

  async function mounted() {
    const { result } = renderHook(() => useDebatePlayback(debateFixture(), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    const slot1 = fakeVideo();
    const slot2 = fakeVideo();
    result.current.slot1VideoRef.current = slot1;
    result.current.slot2VideoRef.current = slot2;
    return { result, slot1, slot2 };
  }

  /**
   * THE REGRESSION Preston hit. `resumeBoth` awaits confirmation that both elements really
   * started; scrolling the card away during that window calls `suspend()`, which pauses them.
   * The confirm poll then saw `paused` and reported 'blocked', so the card showed
   * "Could not play both videos" and sat frozen until it was tapped — for a failure that never
   * happened.
   */
  it('stays silent when the card is scrolled away mid-resume', async () => {
    const { result, slot1, slot2 } = await mounted();

    await act(async () => {
      void result.current.resumeBoth();
      // Let resumeBoth reach its await, so the suspend below lands inside the confirm window
      // rather than before play() was ever called.
      await Promise.resolve();
      result.current.suspend();
      // The confirm poll runs 4x75ms before giving up.
      await new Promise(resolve => setTimeout(resolve, 400));
    });

    expect(result.current.error).toBeNull();
    // And it must not claim to be playing, or the autoplay effect's `!playing` guard would
    // refuse to ever retry this card.
    expect(result.current.playing).toBe(false);
    expect(slot1.paused).toBe(true);
    expect(slot2.paused).toBe(true);
  });

  /** The positive control: an uninterrupted resume still reports playback. */
  it('reports playing when nothing interrupts it', async () => {
    const { result, slot1, slot2 } = await mounted();

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.playing).toBe(true);
    expect(result.current.error).toBeNull();
  });

  /** And the guard must not swallow a real block — the autoplay-policy error still surfaces. */
  it('still surfaces a genuine failure to start', async () => {
    const { result, slot1, slot2 } = await mounted();

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      // The browser refuses to start them and nothing superseded the attempt, so the viewer
      // does need to be told.
      slot1.rejectPlay();
      slot2.rejectPlay();
      await new Promise(resolve => setTimeout(resolve, 400));
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.playing).toBe(false);
  });

  /**
   * A positive control for the direction of the guard rather than a second regression test: a
   * single drag can start a second resume while the first is still confirming, and the card
   * must still end up playing. It is here because the cheap alternative fix — refusing to start
   * a resume while one is in flight — would drop the newer attempt, and if the older one has
   * already been superseded that leaves the card silently stuck, which is the symptom we are
   * trying to remove rather than relocate.
   */
  it('lets the newer of two overlapping resumes finish (not the older)', async () => {
    const { result, slot1, slot2 } = await mounted();

    await act(async () => {
      void result.current.resumeBoth(); // first attempt, superseded below
      await Promise.resolve();
      void result.current.resumeBoth(); // second attempt
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.playing).toBe(true);
    expect(result.current.error).toBeNull();
  });
});

describe('useDebatePlayback — the audible slot follows the render, not the allowance (GEO-2949)', () => {
  beforeEach(() => {
    mocks.turnSegments = [];
    mocks.recordingUrl.mockReset();
    mocks.recordingUrl.mockImplementation(({ filename }: { filename: string }) =>
      Promise.resolve({ url: `https://cdn.test/${filename}?sig=abc` })
    );
  });

  // `debateFixture` is a [30s, 30s] allowance, so without segments the hook hands the floor to
  // slot 1 for the first 30s. The render below cut turn 0 at 20s because that speaker yielded.
  const yieldedSegments: DebateMediaTurnSegment[] = [
    {
      turn_index: 0,
      participant_slot: 1,
      output_start_ms: 0,
      output_end_ms: 20_000,
      duration_ms: 20_000,
      countdown_start_ms: 0,
    },
    {
      turn_index: 1,
      participant_slot: 2,
      output_start_ms: 20_000,
      output_end_ms: 55_000,
      duration_ms: 35_000,
      countdown_start_ms: 25_000,
    },
  ];

  it('unmutes the second speaker from where the render cut, not from the allowance', async () => {
    mocks.turnSegments = yieldedSegments;
    const { result } = renderHook(() => useDebatePlayback(debateFixture(), true));

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    act(() => result.current.seekBoth(25));

    // Without this fix the allowance keeps slot 1 audible until 30s — five seconds of slot 2
    // talking into a muted panel, which is the reported "audio cutting in and out".
    await waitFor(() => expect(result.current.activeSlot).toBe(2));
  });

  it('ends the timeline where the video ends, not where the allowance would', async () => {
    mocks.turnSegments = yieldedSegments;
    const { result } = renderHook(() => useDebatePlayback(debateFixture(), true));

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    expect(result.current.timelineSeconds).toBe(55);
  });

  it('keeps using the allowance when the media job has produced no segments yet', async () => {
    mocks.turnSegments = [];
    const { result } = renderHook(() => useDebatePlayback(debateFixture(), true));

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    expect(result.current.timelineSeconds).toBe(60);
    act(() => result.current.seekBoth(25));
    await waitFor(() => expect(result.current.activeSlot).toBe(1));
  });
});
