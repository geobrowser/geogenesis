import { describe, expect, it } from 'vitest';

import { callDateLabel, callTimeLabel } from './format';

describe('callDateLabel and callTimeLabel', () => {
  it('render the instant in the given zone, across a DST change', () => {
    expect(callTimeLabel('2026-10-26T16:00:00Z', '2026-10-26T17:00:00Z', 'America/Los_Angeles')).toBe(
      '9:00 AM – 10:00 AM PDT'
    );
    expect(callTimeLabel('2026-11-02T17:00:00Z', '2026-11-02T18:00:00Z', 'America/Los_Angeles')).toBe(
      '9:00 AM – 10:00 AM PST'
    );
  });

  it('cross midnight by the zone, not UTC', () => {
    expect(callDateLabel('2026-11-03T02:00:00Z', 'America/New_York')).toBe('Mon, Nov 2');
    expect(callTimeLabel('2026-11-03T02:00:00Z', null, 'America/New_York')).toBe('9:00 PM EST');
  });

  it('are null for an unreadable start', () => {
    expect(callDateLabel('soon', 'UTC')).toBeNull();
    expect(callTimeLabel('soon', null, 'UTC')).toBeNull();
  });
});
