import { act, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from './api';
import { useDebatePlayback } from './use-debate-playback';

const mocks = vi.hoisted(() => ({ recordingUrl: vi.fn() }));

// The hook imports exactly these two from './hooks'. Mocking the module blanks everything
// else in it, so anything omitted here arrives as undefined.
vi.mock('./hooks', () => ({
  useRecordingUrl: () => ({ mutateAsync: mocks.recordingUrl }),
  useDebateTranscript: () => ({ data: { segments: [] }, isLoading: false, error: null }),
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
    /**
     * The browser stopping the element of its own accord — a backgrounded tab pausing a video
     * it considers silent. Distinct from pause(): nothing of ours asked for it, and there is no
     * in-flight play() to interrupt, so the element simply stops.
     */
    browserPause() {
      video.paused = true;
    },
  };
  return video as unknown as HTMLVideoElement & {
    settlePlay: () => void;
    rejectPlay: () => void;
    browserPause: () => void;
  };
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

/**
 * GEO-2947. A debate the viewer is listening to has to survive them clicking into another
 * window. Nothing in the player pauses on blur or on hide — but a backgrounded tab is where a
 * browser stops a silent <video> of its own accord, and the sync step used to read that split
 * pair as "the browser stopped playback on us": it paused the half that was still playing (the
 * audio being listened to) and recorded a *user* pause, which auto-resume then refuses to undo.
 * Switching windows went silent and stayed silent until the card was clicked.
 */
describe('useDebatePlayback — playback survives a backgrounded tab (GEO-2947)', () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    visibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    mocks.recordingUrl.mockReset();
    mocks.recordingUrl.mockImplementation(({ filename }: { filename: string }) =>
      Promise.resolve({ url: `https://cdn.test/${filename}?sig=abc` })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Mounted, both elements attached, and actually playing — the state a viewer leaves behind. */
  async function playing() {
    const { result } = renderHook(() => useDebatePlayback(debateFixture(), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    const slot1 = fakeVideo();
    const slot2 = fakeVideo();
    result.current.slot1VideoRef.current = slot1;
    result.current.slot2VideoRef.current = slot2;

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.playing).toBe(true);
    return { result, slot1, slot2 };
  }

  const setVisibility = (next: DocumentVisibilityState) => {
    visibilityState = next;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  /** THE REGRESSION: the audible half must keep running, and it must not become a user pause. */
  it('leaves the still-playing video alone when the hidden tab splits the pair', async () => {
    const { result, slot1, slot2 } = await playing();

    visibilityState = 'hidden';
    // What the browser does to a silent background <video>: it stops, with no pause() of ours.
    slot2.browserPause();

    act(() => result.current.onPlaybackTick());

    expect(slot1.paused).toBe(false); // the audio the viewer is listening to keeps playing
    expect(result.current.playing).toBe(true);
    expect(result.current.userPaused).toBe(false); // nothing to click past on return
  });

  /**
   * The control, and the behaviour GEO-2783 added: on screen, a split pair really does mean the
   * browser refused us (a blocked unmuted speaker), and the viewer needs the controls back.
   */
  it('still pauses both and surfaces the pause when the split happens on screen', async () => {
    const { result, slot1, slot2 } = await playing();

    slot2.browserPause(); // visibilityState stays 'visible'

    act(() => result.current.onPlaybackTick());

    expect(slot1.paused).toBe(true);
    expect(result.current.playing).toBe(false);
    expect(result.current.userPaused).toBe(true);
  });

  it('restarts a pair the browser paused in the background when the tab comes back', async () => {
    const { result, slot1, slot2 } = await playing();

    visibilityState = 'hidden';
    slot1.browserPause();
    slot2.browserPause();

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.paused).toBe(false);
    expect(slot2.paused).toBe(false);
    expect(result.current.playing).toBe(true);
    expect(result.current.error).toBeNull();
  });

  /** Returning must not restart a debate the viewer had deliberately paused before leaving. */
  it('leaves a debate the viewer paused alone on return', async () => {
    const { result, slot1, slot2 } = await playing();

    act(() => result.current.togglePlayback()); // the viewer pauses
    expect(result.current.userPaused).toBe(true);

    visibilityState = 'hidden';
    await act(async () => {
      setVisibility('visible');
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.paused).toBe(true);
    expect(slot2.paused).toBe(true);
    expect(result.current.playing).toBe(false);
  });

  /**
   * The turn is what un-mutes the speaking video, so nulling it is a mute. Off screen the
   * browser stops whichever element is silent — during slot 2's turn that is slot 1, the one the
   * playhead is read from. Reading "slot 1 is paused" as "there is no turn" therefore silenced
   * slot 2 while it was still playing: the same silence the ticket is about, by another route.
   */
  it('keeps the turn when the hidden tab stops the clock video but not the speaking one', async () => {
    const { result, slot1 } = await playing();

    // Far enough in to be slot 2's turn (30s each), so slot 1 is the muted element.
    act(() => result.current.seekBoth(40));
    await waitFor(() => expect(result.current.turnState?.slot).toBe(2));

    visibilityState = 'hidden';
    slot1.browserPause();

    act(() => result.current.onPlaybackTick());

    expect(result.current.turnState?.slot).toBe(2); // slot 2 stays audible
    expect(result.current.playing).toBe(true);
  });

  /**
   * The return path must not re-create the bug it fixes. `resumeBoth` starts both elements and
   * then spends up to ~300ms confirming, and slot 2 (a cue-less WebM) routinely starts later —
   * so the pair is legitimately split while the tab is already visible again. Slot 1 emits
   * `timeupdate` about four times a second throughout, so a tick lands in that window as a
   * matter of course; treating it as a browser block paused the video that had just started and
   * made it a sticky user pause.
   */
  it('does not pause the pair while a resume is still confirming', async () => {
    const { result, slot1, slot2 } = await playing();

    visibilityState = 'hidden';
    slot1.browserPause();
    slot2.browserPause();

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
      // Slot 1 is up; slot 2 is still parsing. A tick here used to pause slot 1 and stick.
      slot1.settlePlay();
      result.current.onPlaybackTick();
      await Promise.resolve();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.paused).toBe(false);
    expect(slot2.paused).toBe(false);
    expect(result.current.playing).toBe(true);
    expect(result.current.userPaused).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /** A pair the browser let run must not be seeked on return — that is the "no reset" half. */
  it('does not touch a pair that kept playing while the tab was hidden', async () => {
    const { result, slot1, slot2 } = await playing();
    slot1.currentTime = 12;
    slot2.currentTime = 12;

    visibilityState = 'hidden';
    await act(async () => {
      setVisibility('visible');
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.currentTime).toBe(12);
    expect(slot2.currentTime).toBe(12);
    expect(result.current.playing).toBe(true);
  });
});
