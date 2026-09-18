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
    /**
     * How many times playback has been asked for. The interesting question for a cancelled
     * attempt is not whether the element ends up paused — a pause that lands after the restart
     * leaves it paused either way — but whether anything asked it to start again at all.
     */
    plays: 0,
    play() {
      video.plays += 1;
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
    plays: number;
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

  /**
   * The generation check suppresses state writes, but it runs after the helper returns — and by
   * then the helper's muted retry has already called `play()` on both elements. A viewer who
   * paused mid-confirm got the videos back a moment later, muted, under a UI showing paused
   * (GEO-2947). Cancellation has to reach inside the helper, not just guard what comes after it.
   */
  it('does not restart the videos when the viewer grabs the scrubber mid-resume', async () => {
    const { result, slot1, slot2 } = await mounted();
    // Unmuted, so the helper would otherwise take its force-mute-and-retry path.
    slot1.muted = false;
    slot2.muted = false;

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      result.current.beginScrub(); // the viewer grabs the scrubber, mid-confirm
      await new Promise(resolve => setTimeout(resolve, 400));
    });

    // One `play()` each — the attempt that was already under way. The muted retry must not have
    // asked for a second, because nothing after it can take that back.
    expect(slot1.plays).toBe(1);
    expect(slot2.plays).toBe(1);
    expect(slot1.paused).toBe(true);
    expect(slot2.paused).toBe(true);
    expect(result.current.error).toBeNull();
  });

  /** Same for a card scrolled off screen mid-confirm — `suspend` takes ownership too. */
  it('does not restart the videos when the card is scrolled away mid-resume', async () => {
    const { result, slot1, slot2 } = await mounted();
    slot1.muted = false;
    slot2.muted = false;

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      result.current.suspend();
      await new Promise(resolve => setTimeout(resolve, 400));
    });

    expect(slot1.plays).toBe(1);
    expect(slot2.plays).toBe(1);
    expect(slot1.paused).toBe(true);
    expect(slot2.paused).toBe(true);
    expect(result.current.playing).toBe(false);
  });

  /**
   * The drift correction has the same reason to stand down mid-resume as the split-pair check
   * did, and for a while it did not. A resume is a split pair by construction — slot 2, the
   * cue-less WebM, is routinely the later of the two to start — so a tick landing in the confirm
   * window sees a gap that is not drift and answers it by nudging (or hard-seeking) the element
   * that is still trying to begin, which on these files means a parse walk competing with the
   * start it is meant to help (GEO-2828).
   */
  it('does not correct drift against a video that is still starting', async () => {
    const { result, slot1, slot2 } = await mounted();

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      // Slot 1 is up and has played on; slot 2 is still parsing, so it reads far "behind".
      slot1.settlePlay();
      slot1.currentTime = 10;
      slot2.currentTime = 0;
      result.current.onPlaybackTick();
      await Promise.resolve();
    });

    // Left alone: not dragged to slot 1's position, and not put on a corrective rate.
    expect(slot2.currentTime).toBe(0);
    expect(slot2.playbackRate).toBe(1);
  });

  /** The control: once the resume has settled, ordinary drift is corrected as before. */
  it('still corrects drift once the resume has settled', async () => {
    const { result, slot1, slot2 } = await mounted();

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    slot1.currentTime = 10;
    slot2.currentTime = 9.5; // beyond the nudge threshold, inside the seek one
    act(() => result.current.onPlaybackTick());

    expect(slot2.playbackRate).not.toBe(1);
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

  /**
   * Copilot's catch. Standing down off screen keeps the *current* speaker running — but only
   * until the turn changes. At the boundary `audible` moves to the other recording, and if that
   * is the one the browser stopped, the debate goes silent for the rest of it. The stopped
   * element has to be aligned and started, without recording a pause.
   */
  it('restarts the newly speaking video when the turn crosses while hidden', async () => {
    const { result, slot1, slot2 } = await playing();

    visibilityState = 'hidden';
    // Slot 2 is the muted element for all of slot 1's turn, so it is the one a hidden tab stops.
    slot2.browserPause();
    // Slot 1 carries on and crosses into slot 2's turn (30s each, slot 1 speaks first).
    slot1.currentTime = 35;

    act(() => result.current.onPlaybackTick());

    expect(result.current.turnState?.slot).toBe(2); // the turn moved with the running element
    await act(async () => {
      slot2.settlePlay();
      await Promise.resolve();
    });
    expect(slot2.paused).toBe(false); // ...and the speaker was started rather than left stopped
    expect(slot2.currentTime).toBeCloseTo(35, 1); // aligned to where the debate actually is
    expect(result.current.userPaused).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /** ...but a tab where the browser stopped *both* is nobody's audio. Leave it off screen. */
  it('does not restart anything while hidden when the whole pair is stopped', async () => {
    const { result, slot1, slot2 } = await playing();

    visibilityState = 'hidden';
    slot1.browserPause();
    slot2.browserPause();

    act(() => result.current.onPlaybackTick());

    expect(slot1.paused).toBe(true);
    expect(slot2.paused).toBe(true);
  });

  /**
   * Copilot's suppressed comment. `resumeBoth` seeks the pair to the clock's position, and slot 1
   * is the clock — so returning to a tab where slot 1 was the stopped element used to rewind
   * slot 2 to slot 1's frozen position and replay everything heard in the background. The
   * ticket's "returning to the tab: no reset" covers exactly this.
   */
  it('resumes from where the running video got to, not from the stopped one', async () => {
    const { result, slot1, slot2 } = await playing();

    visibilityState = 'hidden';
    slot1.browserPause(); // frozen at 0
    slot2.currentTime = 25; // slot 2 kept playing while the tab was away

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Both recordings start at the debate origin in the fixture, so debate time is element time.
    expect(slot2.currentTime).toBeCloseTo(25, 1); // not rewound to slot 1's frozen 0
    expect(slot1.currentTime).toBeCloseTo(25, 1); // and slot 1 catches up to it
    expect(result.current.playing).toBe(true);
  });

  /**
   * Copilot's second catch, and the sequence it asked for: slot 1 stops, slot 2 advances, slot 2
   * stops too, tab returns. Both elements are now paused and *both* clocks are behind where the
   * debate actually got to — slot 1 by a minute, slot 2 by however long it took the browser to
   * get round to it. Reconstructing the position from either one replays background progress.
   */
  it('resumes from the furthest point reached when the tab stopped both videos in turn', async () => {
    const { result, slot1, slot2 } = await playing();

    visibilityState = 'hidden';
    slot1.browserPause(); // frozen at 0
    // Slot 2's turn (30s each, slot 1 first), so slot 2 is the speaker and nothing restarts
    // slot 1 — this is the pair genuinely running on one clock.
    slot2.currentTime = 40;
    act(() => result.current.onPlaybackTick()); // the tick that observes slot 2 at 40
    slot2.browserPause(); // ...and now the browser stops it too

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.currentTime).toBeCloseTo(40, 1); // not rewound to slot 1's frozen 0
    expect(slot2.currentTime).toBeCloseTo(40, 1);
    expect(result.current.playing).toBe(true);
  });

  /**
   * The same sequence with no tick between slot 2 advancing and slot 2 stopping — which is the
   * realistic shape of it, since `timeupdate` is throttled in a background tab. The hook's memory
   * never saw 40, and slot 2's own `pause` arrives when it already reads as paused, so slot 2's
   * frozen clock is the only record of those last seconds.
   */
  it('resumes from a stopped slot 2 that never reported its last position', async () => {
    const { result, slot1, slot2 } = await playing();

    visibilityState = 'hidden';
    slot1.browserPause(); // frozen at 0
    // Advances and stops with nothing observing it in between.
    slot2.currentTime = 40;
    slot2.browserPause();

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.currentTime).toBeCloseTo(40, 1);
    expect(slot2.currentTime).toBeCloseTo(40, 1);
    expect(result.current.playing).toBe(true);
  });

  /**
   * Copilot's catch, and the foreground half of it. Slot 2 is *deliberately* allowed to run ahead
   * — the drift nudge puts it there, and a stalled slot 1 leaves it much further ahead (GEO-2828)
   * — so an ordinary pause must resume from slot 1's canonical clock. Recovering the furthest
   * position is for a pair the browser stopped off screen, and must not leak into this.
   */
  it('resumes a deliberate pause from slot 1, not from a slot 2 that ran ahead', async () => {
    const { result, slot1, slot2 } = await playing();

    slot1.currentTime = 20;
    slot2.currentTime = 26; // nudged ahead, or running on through a slot 1 stall
    act(() => result.current.onPlaybackTick());

    act(() => result.current.togglePlayback()); // the viewer pauses
    expect(result.current.userPaused).toBe(true);

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.currentTime).toBeCloseTo(20, 1);
    expect(slot2.currentTime).toBeCloseTo(20, 1); // dragged back into step, not left ahead
  });

  /** Same for a card scrolled out of view and back — `suspend` is not a browser stop either. */
  it('resumes a scrolled-away card from slot 1, not from a slot 2 that ran ahead', async () => {
    const { result, slot1, slot2 } = await playing();

    slot1.currentTime = 20;
    slot2.currentTime = 26;
    act(() => result.current.onPlaybackTick());

    act(() => result.current.suspend());

    await act(async () => {
      void result.current.resumeBoth();
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.currentTime).toBeCloseTo(20, 1);
    expect(slot2.currentTime).toBeCloseTo(20, 1);
  });

  /**
   * The counterweight to that memory: it must never drag a deliberate move forward. A scrub back
   * to 10s after playing to 25s has to stay at 10s, not be "corrected" to the furthest point.
   */
  it('lets the viewer scrub backwards past the furthest point played', async () => {
    const { result, slot1, slot2 } = await playing();

    slot1.currentTime = 25;
    slot2.currentTime = 25;
    act(() => result.current.onPlaybackTick());

    act(() => result.current.beginScrub());
    act(() => result.current.seekBoth(10));
    await act(async () => {
      result.current.endScrub();
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.currentTime).toBeCloseTo(10, 1);
    expect(slot2.currentTime).toBeCloseTo(10, 1);
  });

  /**
   * A debate that finished while the tab was away must come back finished.
   *
   * `playheadSeconds`, `playing` and `playbackEnded` are maintained by ticks, and ticks are what a
   * background tab throttles — so on the way back they can all still say "playing, halfway
   * through". Resuming on that would be wrong twice over: there is nothing left to play, and
   * `play()` on an element sitting at its end is defined to start it again from the beginning, so
   * the viewer returns to the debate replaying itself.
   */
  it('comes back finished when the debate ended while the tab was away', async () => {
    const { result, slot1, slot2 } = await playing();
    const playsBefore = slot1.plays;

    visibilityState = 'hidden';
    // Both recordings run out (60s of timeline, 30s a turn) with no tick observing it.
    slot1.currentTime = 60;
    slot2.currentTime = 60;
    slot1.browserPause();
    slot2.browserPause();

    await act(async () => {
      setVisibility('visible');
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.plays).toBe(playsBefore); // nothing asked it to start again
    expect(slot2.plays).toBe(playsBefore);
    expect(result.current.playing).toBe(false);
    expect(result.current.playbackEnded).toBe(true); // so the replay control is offered
    expect(result.current.error).toBeNull();
  });

  /** The control: a debate stopped part-way through still resumes, as before. */
  it('still resumes a debate that was only part-way through', async () => {
    const { result, slot1, slot2 } = await playing();
    const playsBefore = slot1.plays;

    visibilityState = 'hidden';
    slot1.currentTime = 30;
    slot2.currentTime = 30;
    slot1.browserPause();
    slot2.browserPause();

    await act(async () => {
      setVisibility('visible');
      await Promise.resolve();
      slot1.settlePlay();
      slot2.settlePlay();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(slot1.plays).toBeGreaterThan(playsBefore);
    expect(result.current.playing).toBe(true);
    expect(result.current.playbackEnded).toBe(false);
  });

  /**
   * The case where nothing needed resuming at all: the browser let both videos run while the tab
   * was hidden, and they crossed a turn boundary in there. `turnState` is separate state that
   * only ticks maintain, and it is what `audible` reads — so without deriving it from the
   * recovered playhead the pair comes back with the volume still on the debater who stopped
   * speaking, until some later media tick happens to correct it.
   */
  it('moves the turn to the new speaker when a boundary passed while the tab was hidden', async () => {
    const { result, slot1, slot2 } = await playing();
    act(() => result.current.onPlaybackTick()); // establishes slot 1's turn, as a live tick would
    expect(result.current.turnState?.slot).toBe(1);

    visibilityState = 'hidden';
    // Both keep playing, straight through the 30s boundary into slot 2's turn.
    slot1.currentTime = 40;
    slot2.currentTime = 40;

    await act(async () => {
      setVisibility('visible');
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.turnState?.slot).toBe(2);
    expect(result.current.activeSlot).toBe(2);
    // Nothing was stopped, so nothing should have been restarted or seeked.
    expect(slot1.paused).toBe(false);
    expect(slot2.paused).toBe(false);
    expect(slot1.currentTime).toBeCloseTo(40, 1);
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
