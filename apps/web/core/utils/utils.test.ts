import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IPFS_GATEWAY_READ_PATH } from '../constants';
import { GeoDate, GeoNumber, formatShortAddress, getImageHash, getImagePath, getOpenGraphImageUrl } from './utils';

describe('GeoNumber', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should format a number using the default format', () => {
    const result = GeoNumber.format(1234.56);
    expect(result).toBe('1,234.56');
  });

  it('should format a string number using the default format', () => {
    const result = GeoNumber.format('1234.56');
    expect(result).toBe('1,234.56');
  });

  it('should format a number using a rounded format', () => {
    const result = GeoNumber.format(1234.56, 'precision-integer');
    expect(result).toBe('1,235');
  });

  it('should format a number using a percentage format', () => {
    const result = GeoNumber.format(1234.56, 'measure-unit/percent precision-unlimited');
    expect(result).toBe('1,234.56%');
  });

  it('should format a number using a rounded percentage format', () => {
    const result = GeoNumber.format(1234.56, 'measure-unit/percent precision-integer');
    expect(result).toBe('1,235%');
  });

  it('should handle format pattern with :: prefix', () => {
    const result = GeoNumber.format(1234.56, '::precision-integer');
    expect(result).toBe('1,235');
  });

  it('should return the undefined value when value is undefined', () => {
    expect(GeoNumber.format(undefined)).toEqual(undefined);
  });

  it('should handle NaN values', () => {
    const result = GeoNumber.format(NaN);
    expect(result).toBe(NaN);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should handle invalid string values', () => {
    const result = GeoNumber.format('not-a-number');
    expect(result).toBe('not-a-number');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});

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
    expect(GeoDate.fromISOStringUTC('1990-12-16T00:00:00.000+00:00')).toEqual({
      day: '16',
      month: '12',
      year: '1990',
      hour: '12', // should also convert to 12 hour time
      minute: '0',
      meridiem: 'am',
    });

    expect(GeoDate.fromISOStringUTC('1990-12-16T12:30:00.000+00:00')).toEqual({
      day: '16',
      month: '12',
      year: '1990',
      hour: '12',
      minute: '30',
      meridiem: 'pm',
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

describe('getImagePath', () => {
  it('an IPFS pre-fixed string returns the Geo IPFS gateway path', () => {
    expect(getImagePath('ipfs://QmBananaSandwich')).toBe(`${IPFS_GATEWAY_READ_PATH}QmBananaSandwich`);
  });

  it('an HTTP pre-fixed string returns the same string', () => {
    expect(getImagePath('https://banana.sandwich')).toBe('https://banana.sandwich');
  });

  it('a non-HTTP and non-IPFS string returns the same string', () => {
    expect(getImagePath('/banana/sandwich')).toBe('/banana/sandwich');
  });
});

describe('getImageHash', () => {
  it('an IPFS-prefixed path returns the IPFS hash', () => {
    expect(getImageHash('ipfs://QmBananaSandwich')).toBe('QmBananaSandwich');
  });

  it('an HTTP path returns the IPFS hash', () => {
    expect(getImageHash(`${IPFS_GATEWAY_READ_PATH}QmBananaSandwich`)).toBe('QmBananaSandwich');
  });

  it('a non-HTTP and non-IPFS path returns the same string', () => {
    expect(getImageHash('QmBananaSandwich')).toBe('QmBananaSandwich');
  });
});

describe('getOpenGraphImageUrl', () => {
  it('a Geo IPFS gateway path returns the Geo OG preview route', () => {
    expect(getOpenGraphImageUrl('https://api.thegraph.com/ipfs/api/v0/cat?arg=QmBananaSandwich')).toBe(
      'https://www.geobrowser.io/preview/QmBananaSandwich.png'
    );
  });

  it('an HTTP path returns the same string', () => {
    expect(getOpenGraphImageUrl('https://banana.sandwich')).toBe('https://banana.sandwich');
  });

  it('an IPFS-prefixed path returns the Geo OG preview route', () => {
    expect(getOpenGraphImageUrl('ipfs://QmBananaSandwich')).toBe(
      'https://www.geobrowser.io/preview/QmBananaSandwich.png'
    );
  });

  it('a non-empty string that does not match the other values returns the Geo OG preview route', () => {
    expect(getOpenGraphImageUrl('QmBananaSandwich')).toBe('https://www.geobrowser.io/preview/QmBananaSandwich.png');
  });

  it('an empty string returns the default OG image', () => {
    expect(getOpenGraphImageUrl('')).toBe(null);
  });
});

describe('formatShortAddress', () => {
  it('returns a truncated address', () => {
    expect(formatShortAddress('0x1234567890123456789012345678901234567890')).toBe('0x123456...567890');
  });
});
