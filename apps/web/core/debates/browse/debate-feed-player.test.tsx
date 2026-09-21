import { fireEvent, render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from '~/core/debates/api';

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
}) {
  return {
    slot1VideoRef: { current: null },
    slot2VideoRef: { current: null },
    slot1Participant: participant(1),
    slot2Participant: participant(2),
    urls: { slot1: 'https://cdn.test/slot1.webm', slot2: 'https://cdn.test/slot2.webm' },
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
    playheadSeconds: 5,
    timelineSeconds: 60,
    turnState: { slot: overrides.turnSlot, seconds: 10, progress: 0.5 },
    activeSlot: overrides.turnSlot,
    subtitle: overrides.subtitle ?? null,
    onPlaybackTick: vi.fn(),
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
    const { container } = render(<DebateFeedPlayer debate={debate} active votes={votes} />);

    const player = container.querySelector('[data-debate-ready]');
    expect(player?.className).toContain('flex-col');

    const tiles = Array.from(container.querySelectorAll('[aria-label="Pause or play"]')).map(
      control => control.parentElement
    );
    expect(tiles).toHaveLength(2);
    expect(tiles.every(tile => tile?.className.includes('aspect-480/289'))).toBe(true);
  });
});

describe('reduced overlays', () => {
  it('removes inline claim cards while leaving claim details to the card action', () => {
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1 });
    mocks.ticker = {
      ...emptyTicker(),
      cardsBySlot: new Map([[1, [{}]]]),
    };

    const { queryByTestId } = render(<DebateFeedPlayer debate={debate} active reducedOverlays votes={votes} />);

    expect(queryByTestId('claim-stack')).toBeNull();
  });

  it('shows subtitles only for an active, playing, muted compact debate', () => {
    const subtitle = 'A complete subtitle';
    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1, subtitle });
    const { queryByText, rerender } = render(<DebateFeedPlayer debate={debate} active reducedOverlays votes={votes} />);
    expect(queryByText(subtitle)).not.toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: false, turnSlot: 1, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active reducedOverlays votes={votes} />);
    expect(queryByText(subtitle)).toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1, playing: false, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active reducedOverlays votes={votes} />);
    expect(queryByText(subtitle)).toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: true, turnSlot: 1, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active={false} reducedOverlays votes={votes} />);
    expect(queryByText(subtitle)).toBeNull();

    mocks.controller = controllerFixture({ mutedByUser: false, turnSlot: 1, subtitle });
    rerender(<DebateFeedPlayer debate={debate} active votes={votes} />);
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
