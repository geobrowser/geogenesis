import { describe, expect, it } from 'vitest';
import { GeoDate } from './utils';

describe('GeoDate', () => {
  it('converts day, month, year to ISO string at UTC time', () => {
    expect(GeoDate.toISOStringUTC({ day: '16', month: '12', year: '1990' })).toBe('1990-12-16T00:00:00.000Z');
  });

  it('converts ISO string at UTC time to day, month, year', () => {
    expect(GeoDate.fromISOStringUTC('1990-12-16T00:00:00.000Z')).toEqual({
      day: '16',
      month: '12',
      year: '1990',
    });
  });
});
