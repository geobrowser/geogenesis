import { act, fireEvent, render, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import { turnSpansForDurations } from '~/core/debates/playback-utils';

import { DebateFeedPlayer } from './debate-feed-player';

const mocks = vi.hoisted(() => ({
  controller: null as unknown,
  ticker: null as unknown,
  /** The `open` prop each render handed the stack, so a test can read the latest. */
  stackOpens: [] as boolean[],
}));

/** The ticker's shape with nothing in it, which is what most of these tests want. */
const emptyTicker = () => ({
  cardsBySlot: new Map(),
  historyBySlot: new Map(),
  markers: [],
  answers: new Map(),
  onAnswered: vi.fn(),
  rowsByClaimId: new Map(),
  entitiesByClaimId: new Map(),
  participantByClaimId: new Map(),
});

vi.mock('~/core/debates/use-debate-playback', () => ({
  useDebatePlayback: () => mocks.controller,
}));

vi.mock('~/core/debates/use-playback-analytics', () => ({
  usePlaybackAnalytics: () => ({ elementRef: { current: null }, control: vi.fn() }),
}));

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: vi.fn(), closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: null }),
}));

// The player carries a claim ticker now, which reaches for the transcript, the sync engine and a
// query client. These tests are about the audio gate; the ticker has its own suite.
vi.mock('./debate-claim-ticker', () => ({
  useDebateClaimTicker: () => mocks.ticker,
  // Stands in for the stack so the *player's* half is what is under test: whether it opens the
  // corner, and whether it lets go when the stack is gone. Clicking it reports focus arriving,
  // which is all the player ever learns from the real one.
  DebateClaimTickerStack: ({ open, onFocusChange }: { open?: boolean; onFocusChange?: (f: boolean) => void }) => {
    mocks.stackOpens.push(open === true);
    return (
      <button type="button" data-testid="claim-stack" onClick={() => onFocusChange?.(true)}>
        stack
      </button>
    );
  },
  ClaimScrubberMarkers: () => null,
}));

const participant = (slot: 1 | 2): DebateParticipant =>
  ({
    participant_slot: slot,
    profile_space_id: `space-${slot}`,
    position_label: slot === 1 ? 'For' : 'Against',
  }) as unknown as DebateParticipant;

/** Only what the player reads: its id, and the space the ticker looks for claims in. */
const debate = { id: 'debate-1', claim: { space_id: 'space-1' } } as unknown as Debate;

/**
 * A controller in the one state that matters here: playing, with a turn in progress, both
 * recordings loaded. `mutedByUser` and `turnState` are what the audio gating reads.
 */
function controllerFixture(overrides: {
  mutedByUser: boolean;
  turnSlot: 1 | 2;
  isResuming?: boolean;
  /** The browser refused to autoplay — see `useDebatePlayback`. */
  autoplayBlocked?: boolean;
  playing?: boolean;
  playbackEnded?: boolean;
  subtitle?: string | null;
  /** A freshly signed recording, as `refreshSlotUrl` produces — or no recording yet, as the
   * blanking pass that precedes a different pair leaves behind. */
  urls?: { slot1: string | null; slot2: string | null };
  /** Where the playhead sits, which is all a round cue reads. */
  playheadSeconds?: number;
}) {
  /*
   * Four 30s turns from `turnSlot`, and `turnState` read off them rather than pinned.
   *
   * `turnSpansForDurations` takes the debate's *first* slot, so pinning `turnState.slot` to it
   * made the fixture contradict itself the moment a test moved the playhead past the first turn:
   * at 30.5s the spans say slot 2 is speaking while `turnState` still said slot 1. The reply tests
   * were then checking that a badge existed somewhere rather than that it had crossed tiles.
   */
  const turnSpans = turnSpansForDurations(overrides.turnSlot, [30_000, 30_000, 30_000, 30_000]);
  const playheadSeconds = overrides.playheadSeconds ?? 5;
  const speakingSlot = turnSpans.find(span => playheadSeconds < span.endSeconds)?.slot ?? overrides.turnSlot;

  return {
    slot1VideoRef: { current: null },
    slot2VideoRef: { current: null },
    slot1Participant: participant(1),
    slot2Participant: participant(2),
    urls: overrides.urls ?? { slot1: 'https://cdn.test/slot1.webm', slot2: 'https://cdn.test/slot2.webm' },
    ready: true,
    error: null,
    playing: overrides.playing ?? true,
    autoplayBlocked: overrides.autoplayBlocked ?? false,
    userPaused: false,
    isScrubbing: false,
    isResuming: overrides.isResuming ?? false,
    playbackEnded: overrides.playbackEnded ?? false,
    mutedByUser: overrides.mutedByUser,
    setMutedByUser: vi.fn(),
    playheadSeconds,
    // Four 30s turns, so the whole timeline is 120s.
    timelineSeconds: 120,
    turnState: { slot: speakingSlot, seconds: 10, progress: 0.5 },
    turnSpans,
    // The format's count, which is what names a round. Equal to the spans here because nothing was
    // yielded early; the two part company on a debate that was.
    turnCount: 4,
    activeSlot: speakingSlot,
    subtitle: overrides.subtitle ?? null,
    onPlaybackTick: vi.fn(),
    resyncSlot: vi.fn(),
    refreshSlotUrl: vi.fn(),
    togglePlayback: vi.fn(),
    playFromStart: vi.fn(),
    resumeBoth: vi.fn(),
    suspend: vi.fn(),
    seekBoth: vi.fn(),
    beginScrub: vi.fn(),
    endScrub: vi.fn(),
  };
}

function renderPlayer(
  overrides: {
    mutedByUser: boolean;
    turnSlot: 1 | 2;
    isResuming?: boolean;
    autoplayBlocked?: boolean;
    playing?: boolean;
  },
  reactStrictMode = false
) {
  mocks.controller = controllerFixture(overrides);
  const { container, rerender, unmount } = render(<DebateFeedPlayer debate={debate} active />, {
    reactStrictMode,
  });
  const [slot1, slot2] = Array.from(container.querySelectorAll('video'));
  return {
    slot1,
    slot2,
    unmount,
    /** Re-render with a new controller state, as the hook's own state changes would. */
    update(next: { mutedByUser: boolean; turnSlot: 1 | 2; isResuming?: boolean }) {
      mocks.controller = controllerFixture(next);
      rerender(<DebateFeedPlayer debate={debate} active />);
    },
  };
}

beforeEach(() => {
  mocks.controller = null;
  mocks.ticker = emptyTicker();
  mocks.stackOpens = [];
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('player layout', () => {
  it('keeps both stacked videos at the original aspect ratio', () => {
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1 });
    const { container } = render(<DebateFeedPlayer debate={debate} active />);

    const player = container.querySelector('[data-debate-ready]');
    expect(player?.className).toContain('flex-col');

    const tiles = Array.from(container.querySelectorAll('[aria-label="Pause or play"]')).map(
      control => control.parentElement
    );
    expect(tiles).toHaveLength(2);
    expect(tiles.every(tile => tile?.className.includes('aspect-480/289'))).toBe(true);
  });

  /**
   * GEO-3022. The chip was dropped from the tile alongside the "Winner?" pill in #2439, which left
   * the two videos saying who was speaking but not which side they were arguing — the one thing a
   * viewer dropping into the middle of a debate cannot infer.
   */
  it("shows each debater's position beside their name", () => {
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1 });
    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    const { getByText } = within(container);

    // Beside the name and not inside its link: the position is a fact about the debater, not a
    // second way to open their profile.
    for (const [name, position] of [
      ['space-1', 'For'],
      ['space-2', 'Against'],
    ]) {
      const chip = getByText(position);
      const nameNode = getByText(name);
      expect(chip.closest('button')).toBeNull();
      expect(chip.parentElement).toBe(nameNode.closest('button')?.parentElement);
    }
  });

  it('draws no chip for a debater whose position has no label', () => {
    mocks.controller = {
      ...controllerFixture({ mutedByUser: true, turnSlot: 1 }),
      slot1Participant: { ...participant(1), position_label: '' },
    };
    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    const { queryByText } = within(container);

    expect(queryByText('For')).toBeNull();
    expect(queryByText('Against')).not.toBeNull();
  });
});

describe('overlay variants', () => {
  it('removes inline claim cards while leaving claim details to the card action', () => {
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1 });
    mocks.ticker = {
      ...emptyTicker(),
      cardsBySlot: new Map([[1, [{}]]]),
    };

    const { queryByTestId } = render(<DebateFeedPlayer debate={debate} active reducedOverlays />);

    expect(queryByTestId('claim-stack')).toBeNull();
  });

  it('shows subtitles only for an active, playing, muted compact debate', () => {
    const subtitle = 'A complete subtitle';
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1, subtitle });
    const { queryByText, rerender } = render(<DebateFeedPlayer debate={debate} active reducedOverlays />);
    expect(queryByText(subtitle)).not.toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: false, turnSlot: 1, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active reducedOverlays />);
    expect(queryByText(subtitle)).toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1, playing: false, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active reducedOverlays />);
    expect(queryByText(subtitle)).toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active={false} reducedOverlays />);
    expect(queryByText(subtitle)).toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: false, turnSlot: 1, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active />);
    expect(queryByText(subtitle)).not.toBeNull();
  });

  it('preserves the current subtitle when a regular debate is paused or inactive', () => {
    const subtitle = 'The current regular-player subtitle';
    mocks.controller = controllerFixture({ mutedByUser: false, playing: false, turnSlot: 1, subtitle });
    const { queryByText, rerender } = render(<DebateFeedPlayer debate={debate} active />);
    expect(queryByText(subtitle)).not.toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: false, turnSlot: 1, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active={false} />);
    expect(queryByText(subtitle)).not.toBeNull();
  });
});

/**
 * Per-turn audio is the `muted` flag: only the debater whose turn it is is audible, and the
 * viewer's own mute wins over both. Unchanged from master — an attempt to move this gate onto
 * `volume` was reverted, since Blink's effective mute is `muted || volume === 0`, so a listening
 * element at volume 0 is exactly as stoppable off screen as a muted one.
 */
describe('DebateFeedPlayer audio gating (GEO-2947)', () => {
  it('leaves only the speaking debater audible once the viewer un-mutes', () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: false, turnSlot: 1 });

    expect(slot1.muted).toBe(false);
    expect(slot2.muted).toBe(true);
  });

  it('moves the mute with the turn', () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: false, turnSlot: 2 });

    expect(slot1.muted).toBe(true);
    expect(slot2.muted).toBe(false);
  });

  it("honours the viewer's mute on both elements", () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: true, turnSlot: 1 });

    expect(slot1.muted).toBe(true);
    expect(slot2.muted).toBe(true);
  });
});

describe('DebateFeedPlayer repairs a mute made behind React (GEO-2947)', () => {
  it('re-asserts the rendered mute once the resume is over', () => {
    const { slot1, update } = renderPlayer({ mutedByUser: false, turnSlot: 1, isResuming: true });

    // What the fallback does to the speaking element mid-retry, behind React's back.
    slot1.muted = true;
    expect(slot1.muted).toBe(true);

    update({ mutedByUser: false, turnSlot: 1, isResuming: false });

    expect(slot1.muted).toBe(false);
  });

  /** And it must not do it *during* the retry — that would block the play it is waiting on. */
  it('leaves the mute alone while the resume is still confirming', () => {
    const { slot1, update } = renderPlayer({ mutedByUser: false, turnSlot: 1, isResuming: true });

    slot1.muted = true;
    // A tick mid-attempt: the turn moves, so the component re-renders and the effect re-runs.
    update({ mutedByUser: false, turnSlot: 2, isResuming: true });

    expect(slot1.muted).toBe(true);
  });

  /** A mute the viewer made during the attempt wins — it is the rendered truth by then. */
  it('repairs to the newer preference, not the one the attempt started with', () => {
    const { slot1, slot2, update } = renderPlayer({ mutedByUser: false, turnSlot: 1, isResuming: true });

    slot1.muted = true;
    slot2.muted = true;
    update({ mutedByUser: true, turnSlot: 1, isResuming: false });

    expect(slot1.muted).toBe(true);
    expect(slot2.muted).toBe(true);
  });
});

describe('DebateFeedPlayer media release (GEO-2963)', () => {
  it('restores both sources after the Strict Mode cleanup rehearsal', () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: true, turnSlot: 1 }, true);

    expect(slot1.getAttribute('src')).toBe('https://cdn.test/slot1.webm');
    expect(slot2.getAttribute('src')).toBe('https://cdn.test/slot2.webm');
  });

  it('pauses, detaches, and resets both video elements on unmount', () => {
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const load = vi.mocked(HTMLMediaElement.prototype.load);
    const { slot1, slot2, unmount } = renderPlayer({ mutedByUser: true, turnSlot: 1 });

    expect(slot1.getAttribute('src')).toBe('https://cdn.test/slot1.webm');
    expect(slot2.getAttribute('src')).toBe('https://cdn.test/slot2.webm');

    unmount();

    expect(pause).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(slot1.hasAttribute('src')).toBe(false);
    expect(slot2.hasAttribute('src')).toBe(false);
  });
});

/**
 * A refused autoplay has to reach the screen (GEO-2978).
 *
 * Three fixes went in without the control ever appearing, and every attempt to
 * check it went through a browser — which measured the hero carousel at the top
 * of Explore rather than a debate card, twice. This asks the component
 * directly: given a controller that says the browser refused, is there
 * something to tap?
 */
describe('a refused autoplay', () => {
  it('shows the play control', () => {
    const { container } = (() => {
      mocks.controller = controllerFixture({
        mutedByUser: true,
        turnSlot: 1,
        autoplayBlocked: true,
        playing: false,
      });
      return render(<DebateFeedPlayer debate={{ id: 'debate-1' } as unknown as Debate} active />);
    })();

    expect(container.querySelector('[aria-label="Resume debate"]')).not.toBeNull();
  });

  it('shows nothing extra while playback is running normally', () => {
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1 });
    const { container } = render(<DebateFeedPlayer debate={{ id: 'debate-1' } as unknown as Debate} active />);

    expect(container.querySelector('[aria-label="Resume debate"]')).toBeNull();
  });
});

describe('ended playback', () => {
  it('centers one replay button over the video', () => {
    const controller = controllerFixture({
      mutedByUser: true,
      turnSlot: 1,
      playing: false,
      playbackEnded: true,
    });
    mocks.controller = controller;
    const { getByRole } = render(<DebateFeedPlayer debate={debate} active />);

    const replayButton = getByRole('button', { name: 'Replay debate' });
    expect([...replayButton.classList]).toEqual(
      expect.arrayContaining(['top-1/2', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2'])
    );

    fireEvent.click(replayButton);
    expect(controller.playFromStart).toHaveBeenCalledTimes(1);
  });
});

/**
 * The backlog opens on keyboard focus and stays open until focus leaves — a latch, because the
 * corner has to survive a keyboard moving between the cards inside it.
 *
 * Nothing releases that latch if the stack is taken away while the keyboard is in it. A removed
 * element fires no `blur`, so the stack's own handler — the only thing that ever reports focus
 * gone — never runs; see the ticker's suite, which asserts exactly that absence. The stack goes
 * when the debate ends, when the tile scrolls out of the preload window, and when a debate has
 * nothing to show yet, so this is ordinary rather than exotic.
 *
 * `pinnedSlot` is the same shape on a touch screen, where the only other release is a
 * `pointerleave` that early-returns on anything but a mouse.
 */
describe('a backlog latch outliving its stack', () => {
  const withCardsForSlot1 = () => ({
    ...emptyTicker(),
    // The stack is mocked, so only the length is read.
    cardsBySlot: new Map([[1, [{}]]]),
  });

  const renderAt = (playbackEnded: boolean) => {
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1, playbackEnded });
    return <DebateFeedPlayer debate={debate} active />;
  };

  const lastOpen = () => mocks.stackOpens[mocks.stackOpens.length - 1];

  /** Scoped to this render's own container: the suite has no cleanup between tests. */
  const stackIn = (container: HTMLElement) => container.querySelector('[data-testid="claim-stack"]');

  it('closes the corner again once the stack it was holding has gone', () => {
    mocks.ticker = withCardsForSlot1();
    const { container, rerender } = render(renderAt(false));

    // A keyboard tabs in and the corner opens into the backlog.
    fireEvent.click(stackIn(container) as HTMLElement);
    expect(lastOpen()).toBe(true);

    // The debate ends. The stack unmounts without ever reporting that focus left it.
    rerender(renderAt(true));
    expect(stackIn(container)).toBeNull();

    // Replay. The corner has no keyboard and no pointer in it, so it starts closed.
    rerender(renderAt(false));
    expect(lastOpen()).toBe(false);
  });

  // The same latch, released by the same cleanup: a tile scrolled out of the preload window empties
  // the ticker, which takes the stack with it.
  it('closes the corner when the ticker empties rather than the debate ending', () => {
    mocks.ticker = withCardsForSlot1();
    const { container, rerender } = render(renderAt(false));

    fireEvent.click(stackIn(container) as HTMLElement);
    expect(lastOpen()).toBe(true);

    mocks.ticker = emptyTicker();
    rerender(renderAt(false));
    expect(stackIn(container)).toBeNull();

    mocks.ticker = withCardsForSlot1();
    rerender(renderAt(false));
    expect(lastOpen()).toBe(false);
  });
});

/**
 * GEO-2985. Chrome gives up on one of the two cue-less WebM recordings — `error.code === 2`,
 * `FFmpegDemuxer: demuxer seek failed` — after the element has sat in the explore feed's
 * look-ahead preload long enough for the browser to suspend its fetch and resume it. A `<video>`
 * that reports an error is finished: nothing retries it, it paints nothing, and the debate plays
 * on in the other tile with that debater simply absent. That is the reported "one debater's video
 * never loads in the explore feed, while the same debate is fine full screen".
 */
describe('a recording whose pipeline dies is rebuilt (GEO-2985)', () => {
  const controller = () => mocks.controller as ReturnType<typeof controllerFixture>;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function renderPair() {
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 2 });
    const { container, rerender } = render(<DebateFeedPlayer debate={debate} active />);
    const [slot1, slot2] = Array.from(container.querySelectorAll('video'));
    /** Hand the pair different URLs — or none, which is how a new recording arrives. */
    const hand = (urls: { slot1: string | null; slot2: string | null }) => {
      mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 2, urls });
      rerender(<DebateFeedPlayer debate={debate} active />);
    };
    return {
      slot1,
      slot2,
      container,
      hand,
      /** What `refreshSlotUrl` does to this tile: the same recording, signed again. */
      resign: (url: string) => hand({ slot1: url, slot2: 'https://cdn.test/slot2.webm' }),
    };
  }

  /** The control an exhausted tile offers, if it is offering one. */
  const retryButton = (container: HTMLElement) =>
    container.querySelector<HTMLButtonElement>('[aria-label^="Retry"][aria-label$="video"]');

  it('re-attaches the source and asks the controller to put it back in step', () => {
    const { slot1 } = renderPair();
    const src = slot1.getAttribute('src');

    fireEvent.error(slot1);
    // Spaced rather than immediate, so a transient failure has a chance to be over.
    expect(controller().resyncSlot).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));

    // `load()` alone cannot revive an element holding a MediaError — resource selection would run
    // against the src it already has. Detaching first is what makes this a new fetch.
    expect(slot1.getAttribute('src')).toBe(src);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(controller().resyncSlot).toHaveBeenCalledWith(1);
  });

  /**
   * The rebuild's other half, and the half that makes it work at all.
   *
   * `preload="metadata"` is what kills these recordings: MediaRecorder WebM carries no duration
   * and no cues, so the demuxer seeks to find the length, and metadata mode has already stopped
   * fetching by then. A rebuild that keeps it therefore fails identically every time — which is a
   * whole budget spent, a URL re-signed for nothing, and a tile that ends up saying the recording
   * did not load while the same recording plays fine on a page that autoplays it.
   */
  it('raises preload past the mode that killed the pipeline', () => {
    const { slot1, slot2 } = renderPair();
    expect(slot1.preload).toBe('metadata');

    fireEvent.error(slot1);
    act(() => vi.advanceTimersByTime(500));

    expect(slot1.preload).toBe('auto');
    // The tile that is fine keeps the cheap fetch. Several of these are mounted at once.
    expect(slot2.preload).toBe('metadata');
  });

  /**
   * And raised with the re-fetch, not somewhere later.
   *
   * What the recording actually needs is the raise landing before the new fetch has got far enough
   * to fail again, and Chrome is looser about that than the spec's wording suggests: measured
   * against the 89MB slot-1 recording, raising it *after* both `load()` calls still recovers, and
   * so does deferring it by a task. Deferring it by 500ms does not — `error.code === 2` comes
   * straight back, exactly as when nothing raises it at all.
   *
   * That is a window, not a rule, and a window is not something to leave a fix sitting inside. So
   * what is pinned here is the position with margin — in the same breath as the re-fetch — by
   * watching the property at the instant each `load()` runs. It is deliberately stricter than the
   * browser demands: nothing wants the raise anywhere else, and the failure it guards against
   * (the raise drifting into an effect or a timer, where `exhausted` once put it) leaves every
   * end-state assertion green.
   */
  it('raises preload in the same breath as the rebuild re-fetches', () => {
    const { slot1 } = renderPair();
    const preloadAtLoad: string[] = [];
    vi.mocked(HTMLMediaElement.prototype.load).mockImplementation(function (this: HTMLMediaElement) {
      preloadAtLoad.push(this.preload);
    });

    fireEvent.error(slot1);
    act(() => vi.advanceTimersByTime(500));

    // Both of them: `reattachVideoSource` detaches and re-loads before it re-attaches and re-loads.
    expect(preloadAtLoad.length).toBeGreaterThan(0);
    expect(preloadAtLoad).toEqual(preloadAtLoad.map(() => 'auto'));
  });

  /**
   * The re-signed URL keeps it. `onExhausted` re-signs the recording that has just failed every
   * rebuild it was allowed under `metadata`, so handing the fresh URL that same mode would spend
   * an attempt and a multi-megabyte load proving the point a second time.
   */
  it('keeps the raised preload across a re-signed URL', () => {
    const { slot1, resign, container } = renderPair();

    fireEvent.error(slot1);
    act(() => vi.advanceTimersByTime(500));
    expect(slot1.preload).toBe('auto');

    resign('https://cdn.test/slot1-resigned.webm');

    const [resigned] = Array.from(container.querySelectorAll('video'));
    expect(resigned).toBe(slot1);
    expect(resigned.preload).toBe('auto');
  });

  /**
   * And a genuinely different recording gets the light fetch back without anything here putting it
   * back, which is what makes the escalation per-source rather than per-tile.
   *
   * `useDebatePlayback` blanks both URLs before fetching a new pair, so the element the raised
   * `preload` was written on is gone by the time the new recording has a URL, and React builds its
   * replacement from the JSX default. Pinned because the blanking pass is load-bearing from over
   * here and reads like a mere loading state from over there.
   */
  it('starts a different recording from a fresh element', () => {
    const { slot1, hand, container } = renderPair();

    fireEvent.error(slot1);
    act(() => vi.advanceTimersByTime(500));
    expect(slot1.preload).toBe('auto');

    hand({ slot1: null, slot2: null });
    expect(container.querySelectorAll('video')).toHaveLength(0);

    hand({ slot1: 'https://cdn.test/other1.webm', slot2: 'https://cdn.test/other2.webm' });
    const [next] = Array.from(container.querySelectorAll('video'));
    expect(next).not.toBe(slot1);
    expect(next.preload).toBe('metadata');
  });

  it('repairs each tile independently', () => {
    const { slot2 } = renderPair();

    fireEvent.error(slot2);
    act(() => vi.advanceTimersByTime(500));

    expect(controller().resyncSlot).toHaveBeenCalledWith(2);
    expect(controller().resyncSlot).toHaveBeenCalledTimes(1);
  });

  // A genuinely unreadable source answers every rebuild with another error. Unbounded, that is a
  // tile re-fetching a multi-megabyte recording forever — worse than the blank tile it replaces.
  it('gives up after a bounded number of attempts', () => {
    const { slot1 } = renderPair();

    for (let attempt = 0; attempt < 6; attempt++) {
      fireEvent.error(slot1);
      act(() => vi.advanceTimersByTime(2_000));
    }

    expect(controller().resyncSlot).toHaveBeenCalledTimes(3);
  });

  /**
   * `error.code === 2` covers a dead URL as well as a dead pipeline, and every rebuild re-fetches
   * the same bytes from the same signature — so the budget running out is the moment to ask
   * whether the signature is what expired, rather than the moment to give up.
   */
  it('escalates to a freshly signed URL once the budget is spent', () => {
    const { slot1 } = renderPair();

    const exhaust = () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        fireEvent.error(slot1);
        act(() => vi.advanceTimersByTime(2_000));
      }
    };
    exhaust();

    expect(controller().refreshSlotUrl).toHaveBeenCalledWith(1);
    expect(controller().refreshSlotUrl).toHaveBeenCalledTimes(1);

    // And it stays one ask. `load()` on a dead source answers with another `error`, so without a
    // bound here the tile would re-ask on every one of them and lean on the hook's ceiling to
    // absorb it.
    exhaust();
    expect(controller().refreshSlotUrl).toHaveBeenCalledTimes(1);
  });

  it('spends a fresh budget on the re-signed recording', () => {
    const { slot1, resign } = renderPair();

    for (let attempt = 0; attempt < 4; attempt++) {
      fireEvent.error(slot1);
      act(() => vi.advanceTimersByTime(2_000));
    }
    expect(controller().resyncSlot).toHaveBeenCalledTimes(3);

    resign('https://cdn.test/slot1-resigned.webm');
    fireEvent.error(slot1);
    act(() => vi.advanceTimersByTime(500));

    expect(controller().resyncSlot).toHaveBeenCalledWith(1);
  });

  /**
   * Before the rebuild existed this state was undetectable, so saying nothing was the only option.
   * It is detected now, and a blank half of a playing debate that accounts for itself in no way is
   * the report that opened this ticket.
   */
  it('offers the viewer a retry once it has run out of its own', () => {
    const { slot1, container } = renderPair();
    expect(retryButton(container)).toBeNull();

    for (let attempt = 0; attempt < 4; attempt++) {
      fireEvent.error(slot1);
      act(() => vi.advanceTimersByTime(2_000));
    }

    const retry = retryButton(container);
    expect(retry).not.toBeNull();
    expect(container.textContent).toContain('This recording didn’t load');

    act(() => {
      fireEvent.click(retry as HTMLButtonElement);
      vi.advanceTimersByTime(2_000);
    });

    // A person asking is worth a fresh budget, and the tile goes back to showing the recording.
    expect(controller().resyncSlot).toHaveBeenCalledTimes(4);
    expect(retryButton(container)).toBeNull();
  });

  it('does not offer it over a recording that repaired itself', () => {
    const { slot1, container } = renderPair();

    fireEvent.error(slot1);
    act(() => vi.advanceTimersByTime(500));

    expect(retryButton(container)).toBeNull();
  });

  // `load()` itself can fire `error` again before the first repair has finished, and each of
  // those must not book its own rebuild.
  it('does not stack repairs while one is pending', () => {
    const { slot1 } = renderPair();

    fireEvent.error(slot1);
    fireEvent.error(slot1);
    fireEvent.error(slot1);
    act(() => vi.advanceTimersByTime(2_000));

    expect(controller().resyncSlot).toHaveBeenCalledTimes(1);
  });

  // The feed keys its cards by claim, so a re-rank hands a different debate to the same tile. A
  // repair booked for the recording that has just been replaced must not touch the new one.
  it('drops a pending repair when the tile is handed a different recording', () => {
    const { slot1 } = renderPair();

    fireEvent.error(slot1);
    slot1.setAttribute('src', 'https://cdn.test/another.webm');
    act(() => vi.advanceTimersByTime(2_000));

    expect(controller().resyncSlot).not.toHaveBeenCalled();
  });
});

describe('the round it is playing', () => {
  const at = (playheadSeconds: number, extra: { playing?: boolean } = {}) =>
    controllerFixture({ mutedByUser: false, turnSlot: 1, playheadSeconds, ...extra });

  it('announces the round once, on the seam between the tiles', () => {
    mocks.controller = at(0.5);
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    const cards = [...container.querySelectorAll('[data-round-card]')];

    // One card for the player, not one per tile: the round is about both of them.
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-round-card')).toBe('Round 1 · Opening');
  });

  it('takes the top tile\u2019s name with it and gives it straight back', () => {
    // A lower third under a title card is something no broadcast does, because neither gets read.
    // It crossfades against the card, so at full card the name is gone and a second later it is
    // not — and the bottom tile's name, half a player away, never moves.
    mocks.ticker = emptyTicker();

    mocks.controller = at(0.5);
    const up = render(<DebateFeedPlayer debate={debate} active />).container;
    const [topUnder, bottomUnder] = [...up.querySelectorAll('[data-debater-row]')] as HTMLElement[];
    expect(topUnder.style.opacity).toBe('0');
    expect(bottomUnder.style.opacity).toBe('1');

    mocks.controller = at(12);
    const after = render(<DebateFeedPlayer debate={debate} active />).container;
    expect((after.querySelector('[data-debater-row]') as HTMLElement).style.opacity).toBe('1');
  });

  it('does not leave an invisible profile link on the pause surface', () => {
    mocks.controller = at(0.5);
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    const row = container.querySelector('[data-debater-row]') as HTMLElement;

    expect([...row.classList]).toContain('[&_button]:pointer-events-none');
  });

  it('keeps the seam to itself while it is up', () => {
    const subtitle = 'The line under the round card';
    mocks.controller = { ...at(0.5), subtitle };
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    expect(container.querySelector('[data-round-card]')).not.toBeNull();
    expect(container.textContent).not.toContain(subtitle);
  });

  it('parks it beside the timer for the rest of the turn', () => {
    mocks.controller = at(12);
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    expect(container.querySelector('[data-round-card]')).toBeNull();
    // Only the speaking tile has a timer, so only it carries the label.
    const badges = [...container.querySelectorAll('[data-round-badge]')];
    expect(badges).toHaveLength(1);
    expect(badges[0].getAttribute('data-round-badge')).toBe('Round 1 · Opening');
  });

  it('does not announce the round again when the other debater replies', () => {
    // Turn 2 of 4 starts at 30s. The badge is already carrying the round; a second card would be
    // the same announcement made twice.
    mocks.controller = at(30.5);
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    expect(container.querySelector('[data-round-card]')).toBeNull();
    expect(container.querySelector('[data-round-badge]')?.getAttribute('data-round-badge')).toBe('Round 1 · Opening');
  });

  it('carries the badge across to the tile whose turn it now is', () => {
    // The same round on the other debater: the badge belongs to the timer, and the timer follows
    // the speaker. Slot 1 opens, so at 12s it is on slot 1's tile and at 30.5s on slot 2's.
    mocks.ticker = emptyTicker();

    mocks.controller = at(12);
    const opening = render(<DebateFeedPlayer debate={debate} active />).container;
    expect(opening.querySelector('[data-debate-slot="1"] [data-round-badge]')).not.toBeNull();
    expect(opening.querySelector('[data-debate-slot="2"] [data-round-badge]')).toBeNull();

    mocks.controller = at(30.5);
    const reply = render(<DebateFeedPlayer debate={debate} active />).container;
    expect(reply.querySelector('[data-debate-slot="2"] [data-round-badge]')).not.toBeNull();
    expect(reply.querySelector('[data-debate-slot="1"] [data-round-badge]')).toBeNull();
  });

  it('names the round in words a screen reader can read', () => {
    // The card is aria-hidden, so this badge is the only non-visual route to the one thing the
    // page states nowhere else: whether this turn is an opening, a rebuttal or a closing.
    mocks.controller = at(12);
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    const badge = container.querySelector('[data-round-badge]') as HTMLElement;

    expect(badge.hasAttribute('aria-hidden')).toBe(false);
    expect(badge.querySelector('.sr-only')?.textContent).toBe('Round 1, Opening');
  });

  it('names the round the playhead is actually in', () => {
    mocks.controller = at(60.5);
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    expect(container.querySelector('[data-round-card]')?.getAttribute('data-round-card')).toBe('Round 2 · Rebuttal');
  });

  it('stands down while the viewer has the debate paused', () => {
    // A card frozen on a paused tile is an announcement with no turn behind it.
    mocks.controller = at(0.5, { playing: false });
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active />);
    expect(container.querySelector('[data-round-card]')).toBeNull();
    expect(container.querySelector('[data-round-badge]')).toBeNull();
  });

  it('stays off a compact gallery tile, where there is no room for a phrase', () => {
    mocks.controller = at(0.5);
    mocks.ticker = emptyTicker();

    const { container } = render(<DebateFeedPlayer debate={debate} active reducedOverlays />);
    expect(container.querySelector('[data-round-card]')).toBeNull();
    expect(container.querySelector('[data-round-badge]')).toBeNull();
  });
});
