import { describe, expect, it } from 'vitest';

import {
  LEGACY_RANKING_END_DATE_PROPERTY_ID,
  LEGACY_RANKING_START_DATE_PROPERTY_ID,
  RANKING_END_TIME_PROPERTY_ID,
  RANKING_START_TIME_PROPERTY_ID,
} from '~/core/ranking-block-ids';

import {
  RANKING_DATE_PROPERTY_IDS,
  RANKING_END_PROPERTY_IDS,
  RANKING_START_PROPERTY_IDS,
  resolveRankingDate,
  resolveRankingDateValue,
} from './ranking-block-dates';
import { getRankingPeriodState, rankingSubmissionsOpen } from './ranking-period';

const readFrom = (values: Record<string, string>) => (propertyId: string) => values[propertyId];

describe('resolveRankingDate', () => {
  it('reads the datetime property when a block has one', () => {
    const values = {
      [RANKING_START_TIME_PROPERTY_ID]: '2026-06-01T09:30:00.000Z',
      [RANKING_END_TIME_PROPERTY_ID]: '2026-06-30T17:00:00.000Z',
    };

    expect(resolveRankingDate(RANKING_START_PROPERTY_IDS, readFrom(values))).toBe('2026-06-01T09:30:00.000Z');
    expect(resolveRankingDate(RANKING_END_PROPERTY_IDS, readFrom(values))).toBe('2026-06-30T17:00:00.000Z');
  });

  it('falls back to the legacy date-only property for blocks published before the switch', () => {
    const values = {
      [LEGACY_RANKING_START_DATE_PROPERTY_ID]: '2026-06-01',
      [LEGACY_RANKING_END_DATE_PROPERTY_ID]: '2026-06-30',
    };

    expect(resolveRankingDate(RANKING_START_PROPERTY_IDS, readFrom(values))).toBe('2026-06-01');
    expect(resolveRankingDate(RANKING_END_PROPERTY_IDS, readFrom(values))).toBe('2026-06-30');
  });

  it('prefers the datetime property when a block carries both', () => {
    const values = {
      [RANKING_END_TIME_PROPERTY_ID]: '2026-06-30T17:00:00.000Z',
      [LEGACY_RANKING_END_DATE_PROPERTY_ID]: '2026-06-30',
    };

    expect(resolveRankingDate(RANKING_END_PROPERTY_IDS, readFrom(values))).toBe('2026-06-30T17:00:00.000Z');
  });

  it('ignores absent and blank values', () => {
    const values = { [RANKING_END_TIME_PROPERTY_ID]: '   ', [LEGACY_RANKING_END_DATE_PROPERTY_ID]: '2026-06-30' };

    expect(resolveRankingDate(RANKING_END_PROPERTY_IDS, readFrom(values))).toBe('2026-06-30');
    expect(resolveRankingDate(RANKING_END_PROPERTY_IDS, readFrom({}))).toBe('');
  });

  it('subscribes to every property a window can live under', () => {
    expect([...RANKING_DATE_PROPERTY_IDS].sort()).toEqual(
      [
        RANKING_START_TIME_PROPERTY_ID,
        RANKING_END_TIME_PROPERTY_ID,
        LEGACY_RANKING_START_DATE_PROPERTY_ID,
        LEGACY_RANKING_END_DATE_PROPERTY_ID,
      ].sort()
    );
  });
});

describe('legacy ranking blocks', () => {
  it('keeps a closed legacy ranking closed instead of reopening it as no-date', () => {
    const values = {
      [LEGACY_RANKING_START_DATE_PROPERTY_ID]: '2026-05-01',
      [LEGACY_RANKING_END_DATE_PROPERTY_ID]: '2026-05-31',
    };
    const now = new Date('2026-06-04T12:00:00.000Z');

    const startDate = resolveRankingDateValue(RANKING_START_PROPERTY_IDS, readFrom(values));
    const endDate = resolveRankingDateValue(RANKING_END_PROPERTY_IDS, readFrom(values));
    const state = getRankingPeriodState(startDate, endDate, now);

    expect(startDate.isDateOnly).toBe(true);
    expect(endDate.isDateOnly).toBe(true);
    expect(state).toBe('ended');
    expect(rankingSubmissionsOpen(state)).toBe(false);
  });
});
