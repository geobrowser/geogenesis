import { describe, expect, it } from 'vitest';

import { formatDateRange, fromGraphDate, toGraphDate, yearOptions } from './history-dates';

describe('toGraphDate', () => {
  it('writes the shape the graph already uses', () => {
    expect(toGraphDate({ month: 3, year: 2019 })).toBe('2019-03-01Z');
  });

  it('pads a single-digit month', () => {
    expect(toGraphDate({ month: 9, year: 2022 })).toBe('2022-09-01Z');
  });
});

describe('fromGraphDate', () => {
  it('reads back what it writes', () => {
    expect(fromGraphDate(toGraphDate({ month: 6, year: 2022 }))).toEqual({ month: 6, year: 2022 });
  });

  // These strings were written by other tools over several years, so the reader
  // accepts anything carrying a usable year and month.
  it('accepts a full timestamp', () => {
    expect(fromGraphDate('2019-03-01T00:00:00.000Z')).toEqual({ month: 3, year: 2019 });
  });

  it('returns nothing for an absent or unusable date', () => {
    expect(fromGraphDate(null)).toBeNull();
    expect(fromGraphDate('')).toBeNull();
    expect(fromGraphDate('sometime in 2019')).toBeNull();
  });

  it('rejects a month outside the calendar rather than indexing off the end', () => {
    expect(fromGraphDate('2019-13-01Z')).toBeNull();
    expect(fromGraphDate('2019-00-01Z')).toBeNull();
  });
});

describe('formatDateRange', () => {
  it('reads a closed range', () => {
    expect(formatDateRange('2022-06-01Z', '2024-01-01Z')).toBe('Jun 2022 – Jan 2024');
  });

  it('reads an open range as still held', () => {
    expect(formatDateRange('2024-01-01Z', null)).toBe('Jan 2024 – Present');
  });

  // A third of the records carry no dates at all. A lone dash there reads as a
  // rendering fault rather than as missing data, so the row simply shows none.
  it('renders nothing when there are no dates', () => {
    expect(formatDateRange(null, null)).toBeNull();
  });

  it('still says something useful when only an end survived', () => {
    expect(formatDateRange(null, '2021-01-01Z')).toBe('Until Jan 2021');
  });
});

describe('yearOptions', () => {
  it('runs from this year backwards', () => {
    const years = yearOptions(new Date('2026-09-10T00:00:00Z'));

    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(1950);
  });
});
