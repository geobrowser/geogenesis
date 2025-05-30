import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IPFS_GATEWAY_READ_PATH } from '../constants';
import { GeoDate, GeoNumber, formatShortAddress, getImageHash, getImagePath, getOpenGraphImageUrl, getPaginationPages, PagesPaginationPlaceholder } from './utils';

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

  it('toggles a date to a date interval', () => {
    const date = '2023-01-01T12:00:00.000Z';
    const expectedInterval = '2023-01-01T12:00:00.000Z/2023-01-01T12:00:00.000Z';

    expect(GeoDate.toggleDateInterval(date)).toBe(expectedInterval);
  });

  it('toggles a date interval to a single date', () => {
    const dateInterval = '2023-01-01T12:00:00.000Z/2023-01-02T12:00:00.000Z';
    const expectedDate = '2023-01-01T12:00:00.000Z';

    expect(GeoDate.toggleDateInterval(dateInterval)).toBe(expectedDate);
  });

  it('returns empty string when input is undefined', () => {
    expect(GeoDate.toggleDateInterval(undefined)).toBe('');
  });

  it('returns empty string when input is empty', () => {
    expect(GeoDate.toggleDateInterval('')).toBe('');
  });

  it('correctly identifies a date interval', () => {
    expect(GeoDate.isDateInterval('2023-01-01T12:00:00.000Z/2023-01-02T12:00:00.000Z')).toBe(true);
    expect(GeoDate.isDateInterval('2023-01-01T12:00:00.000Z')).toBe(false);
    expect(GeoDate.isDateInterval('')).toBe(false);
    expect(GeoDate.isDateInterval(undefined)).toBe(false);
  });

  describe('format', () => {
    it('formats a single date with default format', () => {
      const date = '2023-01-15T12:30:00.000Z';
      const result = GeoDate.format(date);
      expect(result).toBe('Jan 15, 2023 - 12:30pm');
    });

    it('formats a single date with custom format', () => {
      const date = '2023-01-15T12:30:00.000Z';
      const result = GeoDate.format(date, 'yyyy-MM-dd');
      expect(result).toBe('2023-01-15');
    });

    it('formats a date interval with default format', () => {
      const dateInterval = '2023-01-15T12:30:00.000Z/2023-01-20T15:45:00.000Z';
      const result = GeoDate.format(dateInterval);
      expect(result).toBe('Jan 15, 2023 - 12:30pm — Jan 20, 2023 - 3:45pm');
    });

    it('formats a date interval with custom format', () => {
      const dateInterval = '2023-01-15T12:30:00.000Z/2023-01-20T15:45:00.000Z';
      const result = GeoDate.format(dateInterval, 'yyyy-MM-dd');
      expect(result).toBe('2023-01-15 — 2023-01-20');
    });

    it('returns original string when invalid date is provided', () => {
      const invalidDate = 'not-a-date';
      const result = GeoDate.format(invalidDate);
      expect(result).toBe(invalidDate);
    });

    it('uses default format when invalid format is provided', () => {
      const date = '2023-01-15T12:30:00.000Z';
      const result = GeoDate.format(date, 'invalid-format');
      expect(result).toBe('Jan 15, 2023 - 12:30pm');
    });
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

describe('getPaginationPages', () => {
  it('returns all pages when total pages is 7 or less', () => {
    expect(getPaginationPages(5, 3)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationPages(7, 4)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shows ellipsis after page 7 when current page is within first 7 pages', () => {
    expect(getPaginationPages(11, 5)).toEqual([1, 2, 3, 4, 5, 6, 7, PagesPaginationPlaceholder.skip, 11]);
    expect(getPaginationPages(11, 7)).toEqual([1, 2, 3, 4, 5, 6, 7, PagesPaginationPlaceholder.skip, 11]);
  });

  it('shows ellipsis between page 2 and current-3 when current page is past 7', () => {
    expect(getPaginationPages(11, 8)).toEqual([1, 2, PagesPaginationPlaceholder.skip, 5, 6, 7, 8, PagesPaginationPlaceholder.skip, 11]);
    expect(getPaginationPages(20, 10)).toEqual([1, 2, PagesPaginationPlaceholder.skip, 7, 8, 9, 10, PagesPaginationPlaceholder.skip, 20]);
  });

  it('removes trailing ellipsis when on second-to-last or last page', () => {
    expect(getPaginationPages(11, 10)).toEqual([1, 2, PagesPaginationPlaceholder.skip, 6, 7, 8, 9, 10, 11]);
    expect(getPaginationPages(11, 11)).toEqual([1, 2, PagesPaginationPlaceholder.skip, 6, 7, 8, 9, 10, 11]);
    expect(getPaginationPages(20, 19)).toEqual([1, 2, PagesPaginationPlaceholder.skip, 15, 16, 17, 18, 19, 20]);
    expect(getPaginationPages(20, 20)).toEqual([1, 2, PagesPaginationPlaceholder.skip, 15, 16, 17, 18, 19, 20]);
  });

  it('handles edge case with 8 total pages', () => {
    expect(getPaginationPages(8, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, PagesPaginationPlaceholder.skip, 8]);
    expect(getPaginationPages(8, 7)).toEqual([1, 2, 3, 4, 5, 6, 7, PagesPaginationPlaceholder.skip, 8]);
    expect(getPaginationPages(8, 8)).toEqual([1, 2, PagesPaginationPlaceholder.skip, 3, 4, 5, 6, 7, 8]);
  });

  it('correctly handles all pages from 1 to last with arrow navigation', () => {
    const totalPages = 15;
    
    // Test that we can navigate to every page
    for (let page = 1; page <= totalPages; page++) {
      const result = getPaginationPages(totalPages, page);
      
      // Every result should include page 1, 2, and last page
      expect(result).toContain(1);
      expect(result).toContain(2);
      expect(result).toContain(totalPages);
      
      // If current page > 2, it should be included
      if (page > 2) {
        expect(result).toContain(page);
      }
    }
  });
});
