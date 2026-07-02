import { describe, expect, it } from 'vitest';

import { formatRankingPeriodLabel, getRankingPeriodState, rankingSubmissionsOpen } from './ranking-period';

const now = new Date('2026-06-04T12:00:00.000Z');

describe('getRankingPeriodState', () => {
  it('returns no-date when both dates are empty', () => {
    expect(getRankingPeriodState('', '', now)).toBe('no-date');
  });

  it('returns not-started before the start date', () => {
    expect(getRankingPeriodState('2026-06-20', '2026-07-01', now)).toBe('not-started');
  });

  it('returns in-progress between start and end', () => {
    expect(getRankingPeriodState('2026-05-01', '2026-06-30', now)).toBe('in-progress');
  });

  it('returns ended after the end date', () => {
    expect(getRankingPeriodState('2026-05-01', '2026-05-31', now)).toBe('ended');
  });

  it('returns in-progress with only an end date in the future', () => {
    expect(getRankingPeriodState('', '2026-06-30', now)).toBe('in-progress');
  });
});

describe('formatRankingPeriodLabel', () => {
  it('formats labels for each state', () => {
    expect(formatRankingPeriodLabel('no-date', '', '', now)).toBeNull();
    expect(formatRankingPeriodLabel('not-started', '2026-06-20', '2026-07-01', now)).toMatch(/^Starts in \d+ days$/);
    expect(formatRankingPeriodLabel('in-progress', '2026-05-01', '2026-06-18', now)).toMatch(/^Ends in \d+ days$/);
    expect(formatRankingPeriodLabel('ended', '2026-05-01', '2026-05-31', now)).toBe('Ended');
  });

  it('formats in-progress labels in minutes when under 1 hour', () => {
    expect(formatRankingPeriodLabel('in-progress', '2026-05-01', '2026-06-04T12:30:00.000Z', now)).toBe(
      'Ends in 30 min'
    );
    expect(formatRankingPeriodLabel('in-progress', '2026-05-01', '2026-06-04T12:01:00.000Z', now)).toBe(
      'Ends in 1 min'
    );
  });

  it('formats in-progress labels in hours when under 1 day', () => {
    expect(formatRankingPeriodLabel('in-progress', '2026-05-01', '2026-06-04T18:00:00.000Z', now)).toBe(
      'Ends in 6 hrs'
    );
    expect(formatRankingPeriodLabel('in-progress', '2026-05-01', '2026-06-04T13:00:00.000Z', now)).toBe('Ends in 1 hr');
  });
});

describe('rankingSubmissionsOpen', () => {
  it('allows submissions during in-progress and no-date', () => {
    expect(rankingSubmissionsOpen('in-progress')).toBe(true);
    expect(rankingSubmissionsOpen('no-date')).toBe(true);
    expect(rankingSubmissionsOpen('not-started')).toBe(false);
    expect(rankingSubmissionsOpen('ended')).toBe(false);
  });
});
