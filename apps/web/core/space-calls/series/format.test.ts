import { describe, expect, it } from 'vitest';

import { callWhenLabel } from './format';

describe('callWhenLabel', () => {
  it('renders the instant in the given zone, across a DST change', () => {
    expect(callWhenLabel('2026-10-26T16:00:00Z', '2026-10-26T17:00:00Z', 'America/Los_Angeles')).toBe(
      'Mon, Oct 26 · 9:00 AM – 10:00 AM PDT'
    );
    expect(callWhenLabel('2026-11-02T17:00:00Z', '2026-11-02T18:00:00Z', 'America/Los_Angeles')).toBe(
      'Mon, Nov 2 · 9:00 AM – 10:00 AM PST'
    );
  });

  it('crosses midnight by the zone, not UTC', () => {
    expect(callWhenLabel('2026-11-03T02:00:00Z', null, 'America/New_York')).toBe('Mon, Nov 2 · 9:00 PM EST');
  });

  it('is null for an unreadable start', () => {
    expect(callWhenLabel('soon', null, 'UTC')).toBeNull();
  });
});
