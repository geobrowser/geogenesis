import { describe, expect, it } from 'vitest';

import { compositeTopSlot } from './composite-top-slot';

const people = (slot1: string, slot2: string) => [
  { participant_slot: 1 as const, position_label: slot1 },
  { participant_slot: 2 as const, position_label: slot2 },
];

describe('compositeTopSlot', () => {
  it('puts the Agree speaker on top', () => {
    expect(compositeTopSlot(people('Disagree', 'Agree'))).toBe(2);
    expect(compositeTopSlot(people('Agree', 'Disagree'))).toBe(1);
  });

  it('reads the label ignoring case and spacing, as the app does', () => {
    expect(compositeTopSlot(people('disagree', '  AGREE '))).toBe(2);
  });

  it('keeps slot 1 on top where no side is labelled agree', () => {
    expect(compositeTopSlot(people('Verify', 'Dispute'))).toBe(1);
    expect(compositeTopSlot(people('', ''))).toBe(1);
    expect(compositeTopSlot([])).toBe(1);
    expect(compositeTopSlot(undefined)).toBe(1);
  });
});
