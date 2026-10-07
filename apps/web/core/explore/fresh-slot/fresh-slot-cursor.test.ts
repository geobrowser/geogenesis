import { describe, expect, it } from 'vitest';

import { decodeFreshSlotCursor, encodeFreshSlotCursor } from './fresh-slot-cursor';

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

  it('reads the first page as unpinned, at now', () => {
    expect(decodeFreshSlotCursor(null, NOW)).toMatchObject({
      asOfMs: NOW,
      inner: null,
      pinned: false,
      firstPage: true,
    });
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
