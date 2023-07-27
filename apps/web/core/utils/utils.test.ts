import { describe, expect, it } from 'vitest';

import { GeoDate } from './utils';

describe('GeoDate', () => {
  it('converts day, month, year, hour, minute to ISO string at UTC time', () => {
    expect(GeoDate.toISOStringUTC({ day: '16', month: '12', year: '1990', hour: '12', minute: '30' })).toBe(
      '1990-12-16T12:30:00.000Z'
    );

    // Correctly parses time into two digits
    expect(GeoDate.toISOStringUTC({ day: '16', month: '12', year: '1990', hour: '3', minute: '5' })).toBe(
      '1990-12-16T03:05:00.000Z'
    );
  });

  it('converts ISO string at UTC time to day, month, year, hour, minute', () => {
    expect(GeoDate.fromISOStringUTC('1990-12-16T00:00:00.000Z')).toEqual({
      day: '16',
      month: '12',
      year: '1990',
      hour: '0', // should also convert to 12 hour time
      minute: '0',
    });

    expect(GeoDate.fromISOStringUTC('1990-12-16T12:30:00.000Z')).toEqual({
      day: '16',
      month: '12',
      year: '1990',
      hour: '12',
      minute: '30',
    });
  });

  it('validates leap year', () => {
    expect(GeoDate.isLeapYear(2000)).toBe(true);
    expect(GeoDate.isLeapYear(2001)).toBe(false);
  });

  it('validates month is 30 days', () => {
    expect(GeoDate.isMonth30Days(4)).toBe(true);
    expect(GeoDate.isMonth30Days(6)).toBe(true);
    expect(GeoDate.isMonth30Days(9)).toBe(true);
    expect(GeoDate.isMonth30Days(11)).toBe(true);

    expect(GeoDate.isMonth30Days(1)).toBe(false);
    expect(GeoDate.isMonth30Days(2)).toBe(false);
    expect(GeoDate.isMonth30Days(3)).toBe(false);
    expect(GeoDate.isMonth30Days(5)).toBe(false);
    expect(GeoDate.isMonth30Days(7)).toBe(false);
    expect(GeoDate.isMonth30Days(8)).toBe(false);
    expect(GeoDate.isMonth30Days(10)).toBe(false);
    expect(GeoDate.isMonth30Days(12)).toBe(false);
  });
});
