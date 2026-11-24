import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { getDefaultStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateMediaTurnSegment, DebateParticipant } from '~/core/debates/api';
import type { ClaimMarker } from '~/core/debates/claim-ticker';
import type { DebateMoment } from '~/core/debates/moments-player/debate-moments';
import { turnSpansForDurations } from '~/core/debates/playback-utils';

import { DebateFeedPlayer } from './debate-feed-player';
import { TRANSPORT_HIDE_MS } from './debate-full-header';
import { feedFullPlaybackStartedAtom } from './feed-full-playback';

/*
 * The debate page's dark full screen (GEO-3833): `layout="full"`. The card layout is
 * `debate-feed-player.test.tsx`'s; this file checks what the full screen adds and drops.
 */

const mocks = vi.hoisted(() => ({
  controller: null as unknown,
  ticker: null as unknown,
  control: vi.fn(),
  moments: [] as unknown[],
  turnSegments: [] as unknown[],
  inlineUnavailable: false,
}));

vi.mock('./use-debate-preview-clips', async importOriginal => {
  const actual = await importOriginal<typeof import('./use-debate-preview-clips')>();
  return {
    ...actual,
    useDebatePreviewClips: () => ({
      clips: { slot1: null, slot2: null },
      available: false,
      hasAnyPreview: false,
      offsetSeconds: 0,
      refresh: () => {},
    }),
  };
});
vi.mock('./inline-playback', async importOriginal => {
  const actual = await importOriginal<typeof import('./inline-playback')>();
  return { ...actual, useInlinePlaybackUnavailable: () => mocks.inlineUnavailable };
});
vi.mock('./combined-debate-player', () => ({
  CombinedDebatePlayer: () => <div data-testid="combined-player" />,
}));
vi.mock('~/core/follows/follow-button', () => ({ FollowButton: () => null }));
vi.mock('~/core/follows/person-follow-counts', () => ({
  usePersonFollowerCount: () => null,
  usePersonFollowers: () => null,
}));
vi.mock('~/core/debates/watched-debates', () => ({ markDebateWatched: vi.fn() }));
vi.mock('./use-debate-end-card', () => ({ useDebateEndCard: () => ({}) }));
vi.mock('./debate-end-card', () => ({
  DebateEndCard: ({ tone }: { tone?: string }) => <div data-testid="end-card" data-tone={tone} />,
}));
vi.mock('~/core/debates/participant-bylines', () => ({ useParticipantBylines: () => new Map() }));
vi.mock('~/core/debates/use-debate-playback', () => ({ useDebatePlayback: () => mocks.controller }));
vi.mock('~/core/debates/use-playback-analytics', () => ({
  usePlaybackAnalytics: () => ({ elementRef: { current: null }, control: mocks.control }),
}));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: vi.fn(), closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));
vi.mock('./debate-claim-ticker', () => ({
  useDebateClaimTicker: () => mocks.ticker,
  DebateClaimTickerStack: () => <div data-testid="claim-stack" />,
  ClaimScrubberMarkers: ({ markers, onSeek }: { markers: ClaimMarker[]; onSeek: (ms: number) => void }) => (
    <>
      {markers.map(marker => (
        <button key={marker.id} type="button" aria-label={`Jump to: ${marker.text}`} onClick={() => onSeek(marker.seekMs)} />
      ))}
    </>
  ),
}));
vi.mock('./debate-claim-counter', () => ({ DebateClaimCounter: () => <div data-testid="claim-counter" /> }));
// The rail's two reads, the reel and the media's turns, from their shared cache entries.
vi.mock('~/core/debates/moments-player/use-debate-moments', () => ({
  useDebateMoments: () => ({ status: 'ready', moments: mocks.moments, slotNames: {} }),
}));
vi.mock('~/core/debates/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/hooks')>();
  return { ...actual, useDebateMedia: () => ({ data: { turn_segments: mocks.turnSegments } }) };
});

const participant = (slot: 1 | 2, label: string): DebateParticipant =>
  ({
    participant_slot: slot,
    profile_space_id: `${slot}`.repeat(32),
    position: slot === 1,
    position_label: label,
  }) as unknown as DebateParticipant;

const debate = { id: 'debate-1', claim: { space_id: 'space-1' } } as unknown as Debate;

function controllerFixture(
  overrides: {
    playing?: boolean;
    userPaused?: boolean;
    autoplayBlocked?: boolean;
    playbackEnded?: boolean;
    playheadSeconds?: number;
    turnSlot?: 1 | 2;
    /** Slot 2 argues Agree, so the app draws it on top. */
    agreeInSlot2?: boolean;
    subtitle?: string | null;
    seekBoth?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const turnSpans = turnSpansForDurations(overrides.turnSlot ?? 1, [30_000, 30_000, 30_000, 30_000]);
  const playheadSeconds = overrides.playheadSeconds ?? 5;
  const speakingSlot = turnSpans.find(span => playheadSeconds < span.endSeconds)?.slot ?? 1;
  return {
    slot1VideoRef: { current: null },
    slot2VideoRef: { current: null },
    slot1Participant: participant(1, overrides.agreeInSlot2 ? 'disagree' : 'agree'),
    slot2Participant: participant(2, overrides.agreeInSlot2 ? 'agree' : 'disagree'),
    slot1Poster: null,
    slot2Poster: null,
    urls: { slot1: 'https://cdn.test/slot1.webm', slot2: 'https://cdn.test/slot2.webm' },
    renditions: { slot1: false, slot2: false },
    ready: true,
    error: null,
    playing: overrides.playing ?? true,
    autoplayBlocked: overrides.autoplayBlocked ?? false,
    userPaused: overrides.userPaused ?? false,
    isScrubbing: false,
    isResuming: false,
    playbackEnded: overrides.playbackEnded ?? false,
    mutedByUser: true,
    muteChosen: false,
    setMutedByUser: vi.fn(),
    playheadSeconds,
    timelineSeconds: 120,
    turnState: { slot: speakingSlot, seconds: 10, progress: 0.5 },
    turnSpans,
    turnCount: 4,
    roundTurns: 4,
    turnSegments: [],
    playbackBreaks: { breaks: [], earlyEnds: [], picks: [] },
    activeSlot: speakingSlot,
    subtitle: overrides.subtitle ?? null,
    onPlaybackTick: vi.fn(),
    onMediaEmptied: vi.fn(),
    resyncSlot: vi.fn(),
    refreshSlotUrl: vi.fn(),
    togglePlayback: vi.fn(),
    playFromStart: vi.fn(),
    resumeBoth: vi.fn(),
    pauseBoth: vi.fn(),
    clearSoundBlocked: vi.fn(),
    holdForTransition: vi.fn(() => ({ release: vi.fn(), cancel: vi.fn() })),
    suspend: vi.fn(),
    seekBoth: overrides.seekBoth ?? vi.fn(),
    livePositionMs: () => null,
    recordingStartSeconds: () => 0,
    beginScrub: vi.fn(),
    endScrub: vi.fn(),
  };
}

const parentDebate = (participants: DebateParticipant[], extra: Partial<Debate> = {}) =>
  ({ ...debate, participants, ...extra }) as unknown as Debate;

function renderFull(
  overrides: Parameters<typeof controllerFixture>[0] = {},
  props: Partial<React.ComponentProps<typeof DebateFeedPlayer>> = {}
) {
  const controller = controllerFixture(overrides);
  mocks.controller = controller;
  const onClose = vi.fn();
  const view = render(
    <DebateFeedPlayer
      debate={parentDebate([controller.slot1Participant, controller.slot2Participant])}
      active
      layout="full"
      onClose={onClose}
      {...props}
    />
  );
  const tile = (slot: 1 | 2) => view.container.querySelector<HTMLElement>(`[data-debate-slot="${slot}"]`)!;
  const transport = () => view.container.querySelector<HTMLElement>('[data-debate-transport]')!;
  return { ...view, controller, onClose, tile, transport };
}

beforeEach(() => {
  mocks.ticker = {
    cardsBySlot: new Map(),
    historyBySlot: new Map(),
    markers: [],
    answers: new Map(),
    onAnswered: vi.fn(),
    rowsByClaimId: new Map(),
    entitiesByClaimId: new Map(),
    participantByClaimId: new Map(),
  };
  mocks.control = vi.fn();
  mocks.moments = [];
  mocks.turnSegments = [];
  mocks.inlineUnavailable = false;
  getDefaultStore().set(feedFullPlaybackStartedAtom, false);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the full screen header', () => {
  it('shows the elapsed time and length either side of the rail, and × closes', () => {
    const { onClose, container } = renderFull({ playheadSeconds: 65 });
    const header = container.querySelector<HTMLElement>('[data-debate-full-header]')!;
    expect(within(header).getByText('1:05')).toBeInTheDocument();
    expect(within(header).getByText('2:00')).toBeInTheDocument();
    expect(within(header).getByRole('slider', { name: 'Debate timeline' })).toBeInTheDocument();
    fireEvent.click(within(header).getByRole('button', { name: 'Close full debate' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("puts the reel's moments on the rail at their words, on the recordings' clock, and seeks there", () => {
    // An edited render: turn 1 starts 30 s later on the recordings than in the render.
    mocks.turnSegments = [
      { turn_index: 0, participant_slot: 1, output_start_ms: 0, output_end_ms: 30_000, duration_ms: 30_000, source_start_ms: 0, source_end_ms: 30_000 },
      { turn_index: 1, participant_slot: 2, output_start_ms: 40_000, output_end_ms: 70_000, duration_ms: 30_000, source_start_ms: 70_000, source_end_ms: 100_000 },
    ] satisfies DebateMediaTurnSegment[];
    mocks.moments = [
      { id: 'clip-a', debateStartMs: 41_000, cutStartMs: 39_000 },
      { id: 'clip-b', debateStartMs: 10_000, cutStartMs: 9_750 },
    ] as Partial<DebateMoment>[];
    const seekBoth = vi.fn();
    renderFull({ seekBoth });

    const dots = screen.getAllByRole('button', { name: /^Moment \d of 2$/ });
    expect(dots.map(dot => dot.getAttribute('data-moment-dot'))).toEqual(['10000', '71000']);
    fireEvent.click(screen.getByRole('button', { name: 'Moment 2 of 2' }));
    expect(seekBoth).toHaveBeenCalledWith(71);
    expect(mocks.control).toHaveBeenCalledWith('seek', { input_method: 'scrubber', seek_kind: 'moment_jump' });
  });

  it('keeps the claim markers on the rail with no reel', () => {
    mocks.ticker = {
      ...(mocks.ticker as object),
      markers: [{ id: 'm1', text: 'A claim', atMs: 20_000, seekMs: 19_000, count: 1 }],
    };
    renderFull();
    expect(screen.queryAllByRole('button', { name: /^Moment / })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Jump to: A claim' })).toBeInTheDocument();
  });

  it('shows only × for the combined video of an in-app browser', () => {
    mocks.inlineUnavailable = true;
    const { onClose, container } = renderFull();
    expect(screen.getByTestId('combined-player')).toBeInTheDocument();
    const header = container.querySelector<HTMLElement>('[data-debate-full-header]')!;
    expect(within(header).queryByRole('slider')).toBeNull();
    fireEvent.click(within(header).getByRole('button', { name: 'Close full debate' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the stage', () => {
  it('grows toward whoever is speaking, the app 68/32', () => {
    const speaking = renderFull({ playheadSeconds: 5, turnSlot: 1 });
    expect(speaking.tile(1).style.flexGrow).toBe('0.68');
    expect(speaking.tile(2).style.flexGrow).toBe('0.32');
    cleanup();
    // 35 s in, the second turn: slot 2 holds it.
    const replying = renderFull({ playheadSeconds: 35, turnSlot: 1 });
    expect(replying.tile(1).style.flexGrow).toBe('0.32');
    expect(replying.tile(2).style.flexGrow).toBe('0.68');
  });

  it('measures the split from the tile on top when Agree is in slot 2', () => {
    const { tile } = renderFull({ playheadSeconds: 5, turnSlot: 2, agreeInSlot2: true });
    // Slot 2 is on top and speaking.
    expect(tile(2).className).toContain('order-1');
    expect(tile(2).style.flexGrow).toBe('0.68');
  });

  it('drops the claim cards and Start over, keeping mute on the stage', () => {
    mocks.ticker = { ...(mocks.ticker as object), historyBySlot: new Map([[1, [{}]]]) };
    renderFull();
    expect(screen.queryByTestId('claim-stack')).toBeNull();
    expect(screen.queryByRole('button', { name: /Start over/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause debate' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  });

  it('drops the Open rounds counter too (D12)', () => {
    const controller = controllerFixture();
    mocks.controller = controller;
    render(
      <DebateFeedPlayer
        debate={parentDebate([controller.slot1Participant, controller.slot2Participant], {
          open_rounds: { rounds: [] },
        } as unknown as Partial<Debate>)}
        active
        layout="full"
      />
    );
    expect(screen.queryByTestId('claim-counter')).toBeNull();
  });

  it('places the subtitle on the split, and stands it down while the transport is up', () => {
    const { tile, transport } = renderFull({ subtitle: 'Hello there', playheadSeconds: 5, turnSlot: 1 });
    expect(screen.getByText('Hello there').style.top).toBe('68%');
    fireEvent.click(within(tile(1)).getByRole('button', { name: 'Show video controls' }));
    expect(transport().dataset.debateTransport).toBe('shown');
    expect(screen.queryByText('Hello there')).toBeNull();
  });

  it('keeps the end card, dark', () => {
    renderFull({ playbackEnded: true, playing: false });
    expect(screen.getByTestId('end-card')).toHaveAttribute('data-tone', 'dark');
  });
});

describe('the transport', () => {
  it('is out of view while playing, and a tap on the video brings it up', () => {
    const { tile, transport, controller } = renderFull();
    expect(transport().dataset.debateTransport).toBe('hidden');
    fireEvent.click(within(tile(1)).getByRole('button', { name: 'Show video controls' }));
    expect(transport().dataset.debateTransport).toBe('shown');
    // The tap shows controls; it does not pause.
    expect(controller.togglePlayback).not.toHaveBeenCalled();
  });

  it('is up while paused', () => {
    const { transport } = renderFull({ playing: false, userPaused: true });
    expect(transport().dataset.debateTransport).toBe('shown');
    expect(within(transport()).getByRole('button', { name: 'Play video' })).toBeInTheDocument();
  });

  it('goes away after three seconds of play', () => {
    vi.useFakeTimers();
    const { tile, transport } = renderFull();
    fireEvent.click(within(tile(1)).getByRole('button', { name: 'Show video controls' }));
    act(() => {
      vi.advanceTimersByTime(TRANSPORT_HIDE_MS - 1);
    });
    expect(transport().dataset.debateTransport).toBe('shown');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(transport().dataset.debateTransport).toBe('hidden');
  });

  it('skips ten seconds either way, reported as a seek', () => {
    const seekBoth = vi.fn();
    const { transport } = renderFull({ playheadSeconds: 30, seekBoth });
    fireEvent.click(within(transport()).getByRole('button', { name: 'Forward 10 seconds' }));
    expect(seekBoth).toHaveBeenLastCalledWith(40);
    expect(mocks.control).toHaveBeenLastCalledWith('seek', { input_method: 'skip_button', seek_by_ms: 10_000 });
    fireEvent.click(within(transport()).getByRole('button', { name: 'Rewind 10 seconds' }));
    expect(seekBoth).toHaveBeenLastCalledWith(20);
    expect(mocks.control).toHaveBeenLastCalledWith('seek', { input_method: 'skip_button', seek_by_ms: -10_000 });
  });

  it('stops at the start and short of the end', () => {
    const seekBoth = vi.fn();
    const early = renderFull({ playheadSeconds: 4, seekBoth });
    fireEvent.click(within(early.transport()).getByRole('button', { name: 'Rewind 10 seconds' }));
    expect(seekBoth).toHaveBeenLastCalledWith(0);
    cleanup();
    const late = renderFull({ playheadSeconds: 115, seekBoth });
    fireEvent.click(within(late.transport()).getByRole('button', { name: 'Forward 10 seconds' }));
    expect(seekBoth).toHaveBeenLastCalledWith(119.85);
  });

  it('plays and pauses from its middle button', () => {
    const { transport, controller } = renderFull({ playing: false, userPaused: true });
    fireEvent.click(within(transport()).getByRole('button', { name: 'Play video' }));
    expect(controller.togglePlayback).toHaveBeenCalledTimes(1);
    expect(mocks.control).toHaveBeenCalledWith('play');
  });
});

describe('prompts', () => {
  it("says the app's Tap to play when the browser refused", () => {
    renderFull({ playing: false, autoplayBlocked: true });
    expect(screen.getByRole('button', { name: 'Tap to play' })).toBeInTheDocument();
    expect(screen.queryByText('Watch the debate')).toBeNull();
  });

  it('keeps the Watch pill on a held page, dark', () => {
    renderFull({ playing: false }, { holdFullPlayback: true });
    expect(screen.getByRole('button', { name: 'Watch the debate · 2 min' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play debate' })).toBeNull();
  });
});

describe('the card layout', () => {
  it('draws no header, transport or stage', () => {
    const controller = controllerFixture();
    mocks.controller = controller;
    const { container } = render(
      <DebateFeedPlayer debate={parentDebate([controller.slot1Participant, controller.slot2Participant])} active />
    );
    expect(container.querySelector('[data-debate-full-header]')).toBeNull();
    expect(container.querySelector('[data-debate-transport]')).toBeNull();
    expect(container.querySelector('[data-debate-stage]')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Pause or play' })).toHaveLength(2);
  });
});
