import { describe, expect, it } from 'vitest';

import {
  type LocalAudioGateInput,
  MIC_OVERRUN_AFTER_TURN_MS,
  MIC_PREARM_BEFORE_TURN_MS,
  shouldEnableLocalAudio,
} from './local-audio-gate';

const speaking: LocalAudioGateInput = {
  effectiveStatus: 'in_progress',
  activeSlot: 1,
  localSlot: 1,
  audioMuted: false,
  msSinceTurnEnded: null,
  msUntilTurnStarts: null,
};

const gate = (overrides: Partial<LocalAudioGateInput> = {}) => shouldEnableLocalAudio({ ...speaking, ...overrides });

describe('local audio gate', () => {
  it('is live for the active speaker and closed for the other side', () => {
    expect(gate()).toBe(true);
    expect(gate({ activeSlot: 2 })).toBe(false);
  });

  it('lets the viewer mute themselves whatever the turn says', () => {
    expect(gate({ audioMuted: true })).toBe(false);
    expect(gate({ audioMuted: true, msSinceTurnEnded: 0 })).toBe(false);
    expect(gate({ audioMuted: true, msUntilTurnStarts: 0 })).toBe(false);
  });

  it('keeps the intro and the thank-you an open two-way call', () => {
    for (const effectiveStatus of ['ready', 'thanking'] as const) {
      expect(gate({ effectiveStatus, activeSlot: 2 })).toBe(true);
    }
  });

  it('is closed outside the debate itself', () => {
    expect(gate({ effectiveStatus: null })).toBe(false);
    expect(gate({ effectiveStatus: 'complete', activeSlot: 1 })).toBe(false);
  });

  // GEO-2915, the amputation. The outgoing speaker keeps the mic just long enough to finish the
  // sentence they are already in. Without this their last words are never recorded at all.
  it('holds the outgoing mic open for the overrun, then closes it', () => {
    expect(gate({ activeSlot: 2, msSinceTurnEnded: 0 })).toBe(true);
    expect(gate({ activeSlot: 2, msSinceTurnEnded: MIC_OVERRUN_AFTER_TURN_MS - 1 })).toBe(true);
    expect(gate({ activeSlot: 2, msSinceTurnEnded: MIC_OVERRUN_AFTER_TURN_MS })).toBe(false);
    expect(gate({ activeSlot: 2, msSinceTurnEnded: 10_000 })).toBe(false);
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
    const outgoing = gate({ activeSlot: 2, localSlot: 1, msSinceTurnEnded: 200 });
    const incoming = gate({ activeSlot: 1, localSlot: 2, msUntilTurnStarts: 200 });
    expect([outgoing, incoming]).toEqual([true, true]);
  });
});
