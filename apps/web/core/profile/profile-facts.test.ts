import { describe, expect, it } from 'vitest';

import { type ProfileSpace, formatJoined, orderSpaces, timeOnGeo } from './profile-facts';

/** 29 Jan 2026, the reference account's join date. */
const JOINED = 1769705656;

describe('timeOnGeo', () => {
  it('counts whole months for a first year', () => {
    expect(timeOnGeo(JOINED, new Date('2026-09-15T00:00:00Z'))).toBe('7 mos');
  });

  // 5 March is past the 29th of January once over, so one whole month. The 20th
  // of February is not, which is the case below.
  it('does not pluralise a single month', () => {
    expect(timeOnGeo(JOINED, new Date('2026-03-05T00:00:00Z'))).toBe('1 mo');
  });

  it('waits for the day of the month to come round', () => {
    expect(timeOnGeo(JOINED, new Date('2026-02-20T00:00:00Z'))).toBe('less than a month');
    expect(timeOnGeo(JOINED, new Date('2026-09-15T00:00:00Z'))).toBe('7 mos');
    expect(timeOnGeo(JOINED, new Date('2026-09-29T00:00:00Z'))).toBe('8 mos');
  });

  // Anyone who joined this month. "0 mos" reads as a data error rather than as
  // someone who arrived last week.
  it('says less than a month rather than zero', () => {
    expect(timeOnGeo(JOINED, new Date('2026-01-30T00:00:00Z'))).toBe('less than a month');
  });

  it('switches to years once there is one', () => {
    expect(timeOnGeo(JOINED, new Date('2027-01-29T00:00:00Z'))).toBe('1 yr');
    expect(timeOnGeo(JOINED, new Date('2027-05-29T00:00:00Z'))).toBe('1 yr 4 mos');
    expect(timeOnGeo(JOINED, new Date('2029-03-29T00:00:00Z'))).toBe('3 yrs 2 mos');
  });

  // 725 of 905 personal spaces have no person entity, so there is no created
  // date to read and the row does not render.
  it('has no answer without a join date', () => {
    expect(timeOnGeo(null)).toBeNull();
  });
});

describe('formatJoined', () => {
  it('reads the date in UTC, whatever the reader is in', () => {
    expect(formatJoined(JOINED)).toBe('29 Jan 2026');
  });

  it('has no answer without a join date', () => {
    expect(formatJoined(null)).toBeNull();
  });
});

describe('orderSpaces', () => {
  const space = (name: string | null, id = name ?? 'x'): ProfileSpace => ({
    id,
    name,
    isEditor: true,
  });

  it('sorts named spaces alphabetically', () => {
    expect(orderSpaces([space('Society'), space('AI'), space('Crypto')]).map(s => s.name)).toEqual([
      'AI',
      'Crypto',
      'Society',
    ]);
  });

  // Nine of the reference account's 33 have no name. They are real memberships,
  // so they are kept and sorted last rather than dropped.
  it('puts unnamed spaces last without dropping them', () => {
    const ordered = orderSpaces([space(null, 'a'), space('AI'), space(null, 'b'), space('Crypto')]);

    expect(ordered.map(s => s.name)).toEqual(['AI', 'Crypto', null, null]);
    expect(ordered).toHaveLength(4);
  });

  it('does not mutate what it was given', () => {
    const input = [space('Society'), space('AI')];
    orderSpaces(input);

    expect(input.map(s => s.name)).toEqual(['Society', 'AI']);
  });
});
