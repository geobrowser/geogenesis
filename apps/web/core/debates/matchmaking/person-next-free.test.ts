import { describe, expect, it } from 'vitest';

import { nextFreeLabel } from './person-next-free';

describe('nextFreeLabel', () => {
  // Wednesday 7 Oct 2026, 10:00 local.
  const now = new Date(2026, 9, 7, 10, 0);
  const at = (day: number, hour: number, minute = 0) => ({ start: new Date(2026, 9, day, hour, minute).toISOString() });

  it('names the first time, lowercasing today and tomorrow after "Free"', () => {
    expect(nextFreeLabel({ slots: [at(7, 18)] }, now)).toBe('Free today 6 PM');
    expect(nextFreeLabel({ slots: [at(8, 9, 30), at(9, 18)] }, now)).toBe('Free tomorrow 9:30 AM');
  });

  it('uses the weekday within the coming week', () => {
    expect(nextFreeLabel({ slots: [at(9, 17, 30)] }, now)).toBe('Free Fri 5:30 PM');
  });

  it('says nothing without a time to name', () => {
    expect(nextFreeLabel({ slots: [] }, now)).toBeNull();
    expect(nextFreeLabel(undefined, now)).toBeNull();
  });
});
