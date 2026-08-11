import { describe, expect, it } from 'vitest';

import { GeoDate } from '~/core/utils/utils';

import { to24HourString } from './date-field';

describe('to24HourString', () => {
  it('maps 12 AM to midnight and 12 PM to noon', () => {
    expect(to24HourString('12', 'am')).toBe('0');
    expect(to24HourString('12', 'pm')).toBe('12');
  });

  it('keeps morning hours and shifts afternoon hours by 12', () => {
    expect(to24HourString('1', 'am')).toBe('1');
    expect(to24HourString('11', 'am')).toBe('11');
    expect(to24HourString('1', 'pm')).toBe('13');
    expect(to24HourString('11', 'pm')).toBe('23');
  });

  it('is unaffected by zero-padding', () => {
    expect(to24HourString('09', 'am')).toBe('9');
    expect(to24HourString('09', 'pm')).toBe('21');
  });

  // The bug this guards: a blank hour with PM selected must not become noon.
  it('leaves an empty hour empty regardless of meridiem', () => {
    expect(to24HourString('', 'am')).toBe('');
    expect(to24HourString('', 'pm')).toBe('');
    expect(to24HourString('   ', 'pm')).toBe('');
  });

  it('serializes to the correct UTC hour end to end', () => {
    const iso = (hour: string, meridiem: 'am' | 'pm') =>
      GeoDate.toISOStringUTC({
        day: '15',
        month: '06',
        year: '2026',
        hour: to24HourString(hour, meridiem),
        minute: '30',
      });

    expect(iso('12', 'pm')).toBe('2026-06-15T12:30:00.000Z'); // noon, not next-day hour 24
    expect(iso('12', 'am')).toBe('2026-06-15T00:30:00.000Z'); // midnight, not noon
    expect(iso('9', 'pm')).toBe('2026-06-15T21:30:00.000Z');
    // Empty hour → midnight (date-only serialization), never noon.
    expect(iso('', 'pm')).toBe('2026-06-15T00:00:00.000Z');
  });
});
