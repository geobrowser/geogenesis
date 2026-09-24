import { describe, expect, it } from 'vitest';

import {
  type LocalAudioGateInput,
  MIC_OVERRUN_MAX_MS,
  MIC_PREARM_BEFORE_TURN_MS,
  shouldEnableLocalAudio,
} from './local-audio-gate';

const speaking: LocalAudioGateInput = {
  effectiveStatus: 'in_progress',
  activeSlot: 1,
  localSlot: 1,
  audioMuted: false,
  msSinceTurnEnded: null,
  stillSpeaking: false,
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
    expect(gate({ audioMuted: true, msSinceTurnEnded: 0, stillSpeaking: true })).toBe(false);
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
});
