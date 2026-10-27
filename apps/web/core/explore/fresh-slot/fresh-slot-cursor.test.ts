import { describe, expect, it } from 'vitest';

import { FRESH_SLOT_AS_OF_STEP_MS, decodeFreshSlotCursor, encodeFreshSlotCursor } from './fresh-slot-cursor';

const NOW = 1_790_000_000_000;

describe('the fresh slot cursor', () => {
  it('round-trips the pin, the shown set and the window cursor', () => {
    const encoded = encodeFreshSlotCursor({
      asOfMs: 1_780_000_000_123,
      shown: new Set([0, 5, 47]),
      inner: 'w1:22:abc:d',
    });
    const decoded = decodeFreshSlotCursor(encoded, NOW);
    expect(decoded.asOfMs).toBe(1_780_000_000_123);
    expect([...decoded.shown].sort((a, b) => a - b)).toEqual([0, 5, 47]);
    expect(decoded.inner).toBe('w1:22:abc:d');
    expect(decoded.pinned).toBe(true);
  });

  it('reads the first page as unpinned, at the start of the current minute', () => {
    expect(decodeFreshSlotCursor(null, NOW)).toMatchObject({
      asOfMs: Math.floor(NOW / FRESH_SLOT_AS_OF_STEP_MS) * FRESH_SLOT_AS_OF_STEP_MS,
      inner: null,
      pinned: false,
      firstPage: true,
    });
  });

  it('gives every scroll that starts in the same minute the same pin, so they share one Fresh list', () => {
    const minute = Math.floor(NOW / FRESH_SLOT_AS_OF_STEP_MS) * FRESH_SLOT_AS_OF_STEP_MS;
    const early = decodeFreshSlotCursor(null, minute + 1).asOfMs;
    const late = decodeFreshSlotCursor('w1:22:', minute + FRESH_SLOT_AS_OF_STEP_MS - 1).asOfMs;
    expect(early).toBe(minute);
    expect(late).toBe(minute);
    expect(decodeFreshSlotCursor(null, minute + FRESH_SLOT_AS_OF_STEP_MS).asOfMs).toBe(
      minute + FRESH_SLOT_AS_OF_STEP_MS
    );
  });

  it('passes a plain window cursor through, unpinned, so that scroll stays without the slot', () => {
    expect(decodeFreshSlotCursor('w1:22:', NOW)).toMatchObject({ inner: 'w1:22:', pinned: false, firstPage: false });
  });

  it('survives a malformed head without losing the window cursor', () => {
    expect(decodeFreshSlotCursor('s1:nope:w1:22:', NOW)).toMatchObject({ inner: 'w1:22:', pinned: false });
  });

  it('ignores indices outside the candidate list', () => {
    const encoded = encodeFreshSlotCursor({ asOfMs: 1, shown: new Set([-1, 48, 1000]), inner: null });
    expect([...decodeFreshSlotCursor(encoded, NOW).shown]).toEqual([]);
  });
});
