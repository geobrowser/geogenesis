import { describe, expect, it } from 'vitest';

import type { AvailabilityBlock } from './blocks';
import { hasUpcomingAvailability } from './upcoming-availability';

const ZONE = 'UTC';
// Wednesday 7 October 2026, 12:00 UTC.
const NOW = new Date('2026-10-07T12:00:00Z');

const dated = (date: string, start: number, end: number): AvailabilityBlock => ({
  id: `d-${date}-${start}`,
  kind: 'dated',
  date,
  start,
  end,
});

describe('hasUpcomingAvailability', () => {
  it('is false with nothing saved, or a schedule cleared back to nothing', () => {
    expect(hasUpcomingAvailability(undefined, ZONE, NOW)).toBe(false);
    expect(hasUpcomingAvailability([], ZONE, NOW)).toBe(false);
  });

  it('is true for any weekly block, which always comes round again', () => {
    expect(hasUpcomingAvailability([{ id: 'r', kind: 'recurring', weekday: 0, start: 540, end: 600 }], ZONE, NOW)).toBe(
      true
    );
  });

  it('is false when every one-off date is in the past', () => {
    expect(hasUpcomingAvailability([dated('2026-10-01', 540, 600), dated('2026-10-06', 540, 600)], ZONE, NOW)).toBe(
      false
    );
  });

  it('counts a one-off time until it ends, today included', () => {
    // 09:00–11:00 today has ended; 11:00–13:00 has not.
    expect(hasUpcomingAvailability([dated('2026-10-07', 540, 660)], ZONE, NOW)).toBe(false);
    expect(hasUpcomingAvailability([dated('2026-10-07', 660, 780)], ZONE, NOW)).toBe(true);
    expect(hasUpcomingAvailability([dated('2026-10-20', 540, 600)], ZONE, NOW)).toBe(true);
  });

  it('does not count a future one-off time an exception removes', () => {
    expect(
      hasUpcomingAvailability(
        [dated('2026-10-20', 540, 600), { id: 'x', kind: 'exception', date: '2026-10-20', start: 540, end: 600 }],
        ZONE,
        NOW
      )
    ).toBe(false);
  });
});
