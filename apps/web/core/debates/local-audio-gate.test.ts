import { describe, expect, it } from 'vitest';

import {
  type LocalAudioGateInput,
  MIC_OVERRUN_MAX_MS,
  MIC_PREARM_BEFORE_TURN_MS,
  msLocalAudioStaysClosed,
  shouldEnableLocalAudio,
  turnOverrunPossible,
} from './local-audio-gate';

const speaking: LocalAudioGateInput = {
  effectiveStatus: 'in_progress',
  activeSlot: 1,
  localSlot: 1,
  audioMuted: false,
  msSinceTurnEnded: null,
  stillSpeaking: false,
  msUntilTurnStarts: null,
  openRoundsPhase: null,
  openRoundResultHeld: false,
};

const gate = (overrides: Partial<LocalAudioGateInput> = {}) => shouldEnableLocalAudio({ ...speaking, ...overrides });

describe('local audio gate', () => {
  it('is live for the active speaker and closed for the other side', () => {
    expect(gate()).toBe(true);
    expect(gate({ activeSlot: 2 })).toBe(false);
  });

  it('lets the viewer mute themselves whatever the turn says', () => {
    expect(gate({ audioMuted: true })).toBe(false);
    expect(gate({ audioMuted: true, msSinceTurnEnded: 0, stillSpeaking: true })).toBe(false);
    expect(gate({ audioMuted: true, msUntilTurnStarts: 0 })).toBe(false);
  });

  it('keeps the intro and the thank-you an open two-way call', () => {
    for (const effectiveStatus of ['ready', 'thanking'] as const) {
      expect(gate({ effectiveStatus, activeSlot: 2 })).toBe(true);
    }
  });

  it('opens both mics while voting, unless the viewer muted themselves', () => {
    expect(gate({ activeSlot: null, localSlot: 1, openRoundsPhase: 'deciding' })).toBe(true);
    expect(gate({ activeSlot: null, localSlot: 2, openRoundsPhase: 'deciding' })).toBe(true);
    expect(gate({ activeSlot: null, openRoundsPhase: 'deciding', audioMuted: true })).toBe(false);
  });

  it.each([1, 2] as const)('keeps slot %s muted until the final result hold ends', localSlot => {
    const thanking = {
      localSlot,
      effectiveStatus: 'thanking' as const,
      activeSlot: null,
      openRoundsPhase: 'finished' as const,
      msSinceTurnEnded: 100,
      stillSpeaking: true,
    };
    expect(gate({ ...thanking, openRoundResultHeld: true, stillSpeaking: false })).toBe(false);
    expect(gate({ ...thanking, openRoundResultHeld: false })).toBe(true);
    expect(gate({ ...thanking, openRoundResultHeld: false, audioMuted: true })).toBe(false);
  });

  it.each([1, 2] as const)('mutes slot %s throughout the round transition, even during prearm', localSlot => {
    const transition = { localSlot, activeSlot: null, openRoundsPhase: 'result' as const };
    expect(gate(transition)).toBe(false);
    expect(gate({ ...transition, msUntilTurnStarts: 500 })).toBe(false);
    expect(gate({ ...transition, activeSlot: localSlot })).toBe(false);
    expect(gate({ ...transition, openRoundsPhase: 'speaking', activeSlot: localSlot })).toBe(true);
  });

  it('is closed outside the debate itself', () => {
    expect(gate({ effectiveStatus: null })).toBe(false);
    expect(gate({ effectiveStatus: 'complete', activeSlot: 1 })).toBe(false);
  });

  // GEO-2915, the amputation. The outgoing speaker keeps the mic just long enough to finish the
  // sentence they are already in. Without this their last words are never recorded at all.
  it('holds the outgoing mic open only while they are still talking', () => {
    const over = { activeSlot: 2 as const, msSinceTurnEnded: 0 };
    expect(gate({ ...over, stillSpeaking: true })).toBe(true);
    expect(gate({ ...over, stillSpeaking: false })).toBe(false);
  });

  // A fixed window was the first version, and it was wrong for every sentence of a different
  // length. Someone who finished on time keeps the clean cut they always had, with no dead air
  // added; someone mid-sentence is carried to the end of it.
  it('adds no overrun at all for a speaker who stopped on time', () => {
    for (const msSinceTurnEnded of [0, 500, 1_400, 2_900]) {
      expect(gate({ activeSlot: 2, msSinceTurnEnded, stillSpeaking: false })).toBe(false);
    }
  });

  // The cap is a backstop against a fan or a sustained noise, not the normal exit.
  it('closes at the cap however loud the room is', () => {
    expect(gate({ activeSlot: 2, msSinceTurnEnded: MIC_OVERRUN_MAX_MS - 1, stillSpeaking: true })).toBe(true);
    expect(gate({ activeSlot: 2, msSinceTurnEnded: MIC_OVERRUN_MAX_MS, stillSpeaking: true })).toBe(false);
    expect(gate({ activeSlot: 2, msSinceTurnEnded: 60_000, stillSpeaking: true })).toBe(false);
  });

  // The other half: the incoming mic measured ~2s late because it waited on the server confirming
  // the turn flip. Opening on the local countdown removes the dead air.
  it('opens the incoming mic before the turn is handed over', () => {
    expect(gate({ activeSlot: 2, msUntilTurnStarts: MIC_PREARM_BEFORE_TURN_MS })).toBe(true);
    expect(gate({ activeSlot: 2, msUntilTurnStarts: 0 })).toBe(true);
    expect(gate({ activeSlot: 2, msUntilTurnStarts: MIC_PREARM_BEFORE_TURN_MS + 1 })).toBe(false);
  });

  // Both sides are briefly live across a handoff. That is intended: the composite takes audio from
  // the active slot per turn, so the overlap exists in the call and never in the recording.
  it('allows both mics to be live across the handoff itself', () => {
    const outgoing = gate({ activeSlot: 2, localSlot: 1, msSinceTurnEnded: 200, stillSpeaking: true });
    const incoming = gate({ activeSlot: 1, localSlot: 2, msUntilTurnStarts: 200 });
    expect([outgoing, incoming]).toEqual([true, true]);
  });

  it('lets an overrun run into whatever follows the turn, but not past the debate (GEO-3407)', () => {
    expect(turnOverrunPossible({ effectiveStatus: 'in_progress' })).toBe(true);
    expect(turnOverrunPossible({ effectiveStatus: 'thanking' })).toBe(true);
    expect(turnOverrunPossible({ effectiveStatus: 'complete' })).toBe(false);
    expect(turnOverrunPossible({ effectiveStatus: 'cancelled' })).toBe(false);
  });

  // GEO-3407. A round's second turn ends straight into a required round's lead-in, or on the
  // debate's last turn into the final board. Both close the mics, and used to close the overrun
  // with them, so the second speaker was cut off mid-sentence at the end of every such round.
  describe("the second speaker's overrun at the end of a round", () => {
    const overrunning = { activeSlot: null, msSinceTurnEnded: 100, stillSpeaking: true } as const;

    it.each([1, 2] as const)('carries slot %s into a required round lead-in', localSlot => {
      expect(gate({ ...overrunning, localSlot, openRoundsPhase: 'result' })).toBe(true);
      expect(gate({ ...overrunning, localSlot, openRoundsPhase: 'result', msSinceTurnEnded: MIC_OVERRUN_MAX_MS })).toBe(
        false
      );
      expect(gate({ ...overrunning, localSlot, openRoundsPhase: 'result', stillSpeaking: false })).toBe(false);
    });

    it.each([1, 2] as const)('carries slot %s into the final board after the last turn', localSlot => {
      const finalBoard = {
        ...overrunning,
        localSlot,
        effectiveStatus: 'thanking' as const,
        openRoundsPhase: 'finished' as const,
        openRoundResultHeld: true,
      };
      expect(gate(finalBoard)).toBe(true);
      expect(gate({ ...finalBoard, stillSpeaking: false })).toBe(false);
    });

    it('still respects the viewer muting themselves, and nothing runs over past the debate', () => {
      expect(gate({ ...overrunning, openRoundsPhase: 'result', audioMuted: true })).toBe(false);
      expect(gate({ ...overrunning, effectiveStatus: 'complete' })).toBe(false);
    });
  });

  // GEO-3410: recording parts go out only inside this.
  describe('how long the mic is sure to stay closed', () => {
    const closed = (overrides: Partial<LocalAudioGateInput>, msUntilPhaseEnds: number) =>
      msLocalAudioStaysClosed({ ...speaking, activeSlot: 2, ...overrides }, msUntilPhaseEnds);

    it('is nothing while the mic is live, however the gate opened it', () => {
      expect(msLocalAudioStaysClosed(speaking, 30_000)).toBe(0);
      expect(closed({ openRoundsPhase: 'deciding' }, 8_000)).toBe(0);
      expect(closed({ msUntilTurnStarts: 800 }, 800)).toBe(0);
      expect(
        closed({ activeSlot: null, msSinceTurnEnded: 100, stillSpeaking: true, openRoundsPhase: 'result' }, 3_000)
      ).toBe(0);
    });

    it('ends the prearm before the next boundary of the room clock', () => {
      expect(closed({}, 30_000)).toBe(30_000 - MIC_PREARM_BEFORE_TURN_MS);
      // A round's last turn ends into the vote, which opens both mics.
      expect(closed({ openRoundsPhase: 'speaking' }, 12_000)).toBe(12_000 - MIC_PREARM_BEFORE_TURN_MS);
      expect(closed({ activeSlot: null, openRoundsPhase: 'result' }, 3_000)).toBe(3_000 - MIC_PREARM_BEFORE_TURN_MS);
      expect(closed({ effectiveStatus: 'preflight', activeSlot: null }, 5_000)).toBe(5_000 - MIC_PREARM_BEFORE_TURN_MS);
      expect(closed({}, 500)).toBe(0);
    });

    it('opens no later than the turn the gate is counting into', () => {
      expect(closed({ msUntilTurnStarts: 1_500 }, 4_000)).toBe(1_500 - MIC_PREARM_BEFORE_TURN_MS);
    });
  });
});
