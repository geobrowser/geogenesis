import { describe, expect, it } from 'vitest';

import {
  formatDateRange,
  formatDuration,
  formatTotalDuration,
  fromGraphDate,
  isOrderedRange,
  toGraphDate,
  yearOptions,
} from './history-dates';

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

describe('formatDuration', () => {
  const now = new Date('2026-09-11T00:00:00Z');

  it('reads a closed stretch the way a CV states it', () => {
    expect(formatDuration('2022-06-01Z', '2024-01-01Z', now)).toBe('1 yr 8 mos');
  });

  it('counts an open stretch up to today', () => {
    expect(formatDuration('2025-02-01Z', null, now)).toBe('1 yr 8 mos');
  });

  // Inclusive of the month it started in, so a job begun and left in the same
  // month reads as a month rather than as nothing at all.
  it('counts a single month as a month', () => {
    expect(formatDuration('2024-03-01Z', '2024-03-01Z', now)).toBe('1 mo');
  });

  it('drops the months when it lands on a whole year', () => {
    expect(formatDuration('2023-01-01Z', '2023-12-01Z', now)).toBe('1 yr');
  });

  it('says nothing without a start', () => {
    expect(formatDuration(null, '2024-01-01Z', now)).toBeNull();
  });

  it('says nothing when the dates run backwards', () => {
    expect(formatDuration('2024-01-01Z', '2022-01-01Z', now)).toBeNull();
  });
});

describe('isOrderedRange', () => {
  it('accepts a range that runs forwards, including within one month', () => {
    expect(isOrderedRange({ month: 3, year: 2019 }, { month: 1, year: 2021 })).toBe(true);
    expect(isOrderedRange({ month: 3, year: 2019 }, { month: 3, year: 2019 })).toBe(true);
  });

  it('rejects one that runs backwards, including within one year', () => {
    expect(isOrderedRange({ month: 1, year: 2021 }, { month: 3, year: 2019 })).toBe(false);
    expect(isOrderedRange({ month: 6, year: 2019 }, { month: 3, year: 2019 })).toBe(false);
  });

  // Half a pair is not wrong yet; only a complete one can be backwards.
  it('accepts an unfinished pair', () => {
    expect(isOrderedRange(null, { month: 3, year: 2019 })).toBe(true);
    expect(isOrderedRange({ month: 3, year: 2019 }, null)).toBe(true);
    expect(isOrderedRange(null, null)).toBe(true);
  });
});

describe('yearOptions', () => {
  // A degree in progress is recorded by having no end date, so a date in the
  // future would say it had finished — education briefly offered those years for
  // an expected graduation, which is why this is pinned.
  it('stops at the present', () => {
    expect(yearOptions(new Date('2026-09-13T00:00:00Z'))[0]).toBe(2026);
  });
});

describe('formatTotalDuration', () => {
  const NOW = new Date('2026-09-13T00:00:00Z');
  const closed = (start: string, end: string) => ({ start, end, isOpen: false });

  // The bug this exists for: earliest start to latest end counted the years away
  // from an employer as years spent there.
  it('does not count the gap between two spells at one employer', () => {
    expect(formatTotalDuration([closed('2015-01-01Z', '2016-12-01Z'), closed('2024-01-01Z', '2025-12-01Z')], NOW)).toBe(
      '4 yrs'
    );
  });

  it('counts two roles held at once only once', () => {
    expect(formatTotalDuration([closed('2020-01-01Z', '2022-12-01Z'), closed('2021-01-01Z', '2021-12-01Z')], NOW)).toBe(
      '3 yrs'
    );
  });

  it('joins a promotion that begins the month after the role it grew out of', () => {
    expect(formatTotalDuration([closed('2024-01-01Z', '2024-03-01Z'), closed('2024-04-01Z', '2024-06-01Z')], NOW)).toBe(
      '6 mos'
    );
  });

  it('runs an unfinished row up to the present', () => {
    expect(formatTotalDuration([{ start: '2026-01-01Z', end: null, isOpen: true }], NOW)).toBe('9 mos');
  });

  // Nothing to measure: a row that finished without recording when could have
  // lasted a week or a decade, and assuming either invents tenure.
  it('has no answer where the rows all ended at unknown dates', () => {
    expect(formatTotalDuration([{ start: '2018-01-01Z', end: null, isOpen: false }], NOW)).toBeNull();
  });

  it('ignores a row with no dates at all', () => {
    expect(formatTotalDuration([{ start: null, end: null, isOpen: false }], NOW)).toBeNull();
  });

  it('measures the rows it can when another has no end', () => {
    expect(
      formatTotalDuration(
        [closed('2020-01-01Z', '2020-06-01Z'), { start: '2018-01-01Z', end: null, isOpen: false }],
        NOW
      )
    ).toBe('6 mos');
  });
});
