import { render } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from '~/core/debates/api';
import type { DebateVotesResult } from '~/core/debates/use-debate-votes';

import { DebateFeedPlayer } from './debate-feed-player';

const mocks = vi.hoisted(() => ({ controller: null as unknown }));

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
  useDebateClaimTicker: () => ({
    cardsBySlot: new Map(),
    historyBySlot: new Map(),
    markers: [],
    answers: new Map(),
    onAnswered: vi.fn(),
    rowsByClaimId: new Map(),
    entitiesByClaimId: new Map(),
    participantByClaimId: new Map(),
  }),
  DebateClaimTickerStack: () => null,
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

const votes: DebateVotesResult = {
  sharePercentFor: () => null,
  isMyPick: () => false,
  hasVoted: false,
  isVoting: false,
  castVote: async () => {},
};

/**
 * A controller in the one state that matters here: playing, with a turn in progress, both
 * recordings loaded. `mutedByUser` and `turnState` are what the audio gating reads.
 */
function controllerFixture(overrides: { mutedByUser: boolean; turnSlot: 1 | 2; isResuming?: boolean }) {
  return {
    slot1VideoRef: { current: null },
    slot2VideoRef: { current: null },
    slot1Participant: participant(1),
    slot2Participant: participant(2),
    urls: { slot1: 'https://cdn.test/slot1.webm', slot2: 'https://cdn.test/slot2.webm' },
    ready: true,
    error: null,
    playing: true,
    userPaused: false,
    isScrubbing: false,
    isResuming: overrides.isResuming ?? false,
    playbackEnded: false,
    mutedByUser: overrides.mutedByUser,
    setMutedByUser: vi.fn(),
    playheadSeconds: 5,
    timelineSeconds: 60,
    turnState: { slot: overrides.turnSlot, seconds: 10, progress: 0.5 },
    activeSlot: overrides.turnSlot,
    subtitle: null,
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

function renderPlayer(overrides: { mutedByUser: boolean; turnSlot: 1 | 2; isResuming?: boolean }) {
  mocks.controller = controllerFixture(overrides);
  const { container, rerender } = render(<DebateFeedPlayer debate={debate} active votes={votes} />);
  const [slot1, slot2] = Array.from(container.querySelectorAll('video'));
  return {
    slot1,
    slot2,
    /** Re-render with a new controller state, as the hook's own state changes would. */
    update(next: { mutedByUser: boolean; turnSlot: 1 | 2; isResuming?: boolean }) {
      mocks.controller = controllerFixture(next);
      rerender(<DebateFeedPlayer debate={debate} active votes={votes} />);
    },
  };
}

/**
 * Per-turn audio is the `muted` flag: only the debater whose turn it is is audible, and the
 * viewer's own mute wins over both. Unchanged from master — an attempt to move this gate onto
 * `volume` was reverted, since Blink's effective mute is `muted || volume === 0`, so a listening
 * element at volume 0 is exactly as stoppable off screen as a muted one.
 */
describe('DebateFeedPlayer audio gating (GEO-2947)', () => {
  beforeEach(() => {
    mocks.controller = null;
  });

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
