import { render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const participant = (slot: 1 | 2): DebateParticipant =>
  ({
    participant_slot: slot,
    profile_space_id: `space-${slot}`,
    position_label: slot === 1 ? 'For' : 'Against',
  }) as unknown as DebateParticipant;

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
function controllerFixture(overrides: { mutedByUser: boolean; turnSlot: 1 | 2 }) {
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

function renderPlayer(overrides: { mutedByUser: boolean; turnSlot: 1 | 2 }) {
  mocks.controller = controllerFixture(overrides);
  const { container } = render(
    <DebateFeedPlayer debate={{ id: 'debate-1' } as unknown as Debate} active votes={votes} />
  );
  const [slot1, slot2] = Array.from(container.querySelectorAll('video'));
  return { slot1, slot2 };
}

/**
 * Per-turn audio is gated with `volume`, not `muted` (GEO-2947): `muted` carries only the
 * viewer's own mute — the same thing `playFromStart` and the autoplay fallback write it for — so
 * the element no longer has two notions of "muted" written to it from two places. It also stops
 * the listening debater's element from looking like a silent video to a backgrounded tab.
 */
/**
 * iOS Safari: `volume` is read-only. The write is accepted and ignored, and the property stays
 * at 1 — so a component that silences the listening debater with volume alone puts both of them
 * on air at once. jsdom happily honours volume, so the platform has to be stubbed to test it.
 */
function stubReadOnlyVolume() {
  const original = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    configurable: true,
    get: () => 1,
    set: () => {},
  });
  return () => {
    if (original) Object.defineProperty(HTMLMediaElement.prototype, 'volume', original);
    else Reflect.deleteProperty(HTMLMediaElement.prototype, 'volume');
  };
}

describe('DebateFeedPlayer audio gating (GEO-2947)', () => {
  beforeEach(() => {
    mocks.controller = null;
  });

  it('un-mutes both elements once the viewer un-mutes, and gives the turn to the speaker', () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: false, turnSlot: 1 });

    expect(slot1.muted).toBe(false);
    expect(slot2.muted).toBe(false); // not muted — merely silent, so a hidden tab keeps it running
    expect(slot1.volume).toBe(1);
    expect(slot2.volume).toBe(0);
  });

  it('moves the volume with the turn', () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: false, turnSlot: 2 });

    expect(slot1.volume).toBe(0);
    expect(slot2.volume).toBe(1);
  });

  it("honours the viewer's mute on both elements", () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: true, turnSlot: 1 });

    expect(slot1.muted).toBe(true);
    expect(slot2.muted).toBe(true);
    // The turn still moves the volume underneath — `muted` is what silences it, and un-muting
    // therefore lands the viewer on the speaker rather than on both recordings at once.
    expect(slot1.volume).toBe(1);
    expect(slot2.volume).toBe(0);
  });
});

describe('DebateFeedPlayer audio gating where volume is read-only (GEO-2947)', () => {
  let restoreVolume: (() => void) | null = null;

  beforeEach(() => {
    restoreVolume = stubReadOnlyVolume();
  });

  afterEach(() => {
    restoreVolume?.();
    restoreVolume = null;
  });

  /** THE REGRESSION Copilot caught: without the fallback, both debaters are audible on iOS. */
  it('mutes the listening debater when the volume assignment does not stick', () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: false, turnSlot: 1 });

    expect(slot1.muted).toBe(false); // the speaker is still the one you hear
    expect(slot2.muted).toBe(true); // ...and the listener is silenced the only way left
  });

  it('moves that mute with the turn', () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: false, turnSlot: 2 });

    expect(slot1.muted).toBe(true);
    expect(slot2.muted).toBe(false);
  });

  it("still honours the viewer's own mute on both elements", () => {
    const { slot1, slot2 } = renderPlayer({ mutedByUser: true, turnSlot: 1 });

    expect(slot1.muted).toBe(true);
    expect(slot2.muted).toBe(true);
  });
});
