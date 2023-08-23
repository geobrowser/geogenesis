import { describe, expect, it } from 'vitest';

import { GeoDate, formatShortAddress, getImageHash, getImagePath, getOpenGraphImageUrl } from './utils';

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

describe('getImagePath', () => {
  it('an IPFS pre-fixed string returns the Geo IPFS gateway path', () => {
    expect(getImagePath('ipfs://QmBananaSandwich')).toBe(
      'https://api.thegraph.com/ipfs/api/v0/cat?arg=QmBananaSandwich'
    );
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
    expect(getImageHash('https://api.thegraph.com/ipfs/api/v0/cat?arg=QmBananaSandwich')).toBe('QmBananaSandwich');
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
    expect(getOpenGraphImageUrl('')).toBe('https://www.geobrowser.io/static/geo-social-image-v2.png');
  });
});

describe('formatShortAddress', () => {
  it('returns a truncated address', () => {
    expect(formatShortAddress('0x1234567890123456789012345678901234567890')).toBe('0x123456...567890');
  });
});
