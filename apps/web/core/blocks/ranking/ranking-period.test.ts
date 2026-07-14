import { addDays, startOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';

import {
  formatRankingPeriodLabel,
  getRankingPeriodState,
  msUntilRankingPeriodChange,
  rankingSubmissionsOpen,
} from './ranking-period';

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

  it('returns ended when a datetime end time has already passed today', () => {
    expect(getRankingPeriodState('2026-05-01', '2026-06-04T10:00:00.000Z', now)).toBe('ended');
  });

  it('keeps date-only end dates in progress through the end calendar day', () => {
    expect(getRankingPeriodState('2026-05-01', '2026-06-04', now)).toBe('in-progress');
  });
});

describe('formatRankingPeriodLabel', () => {
  it('formats labels for each state', () => {
    expect(formatRankingPeriodLabel('no-date', '', '', now)).toBeNull();
    expect(formatRankingPeriodLabel('not-started', '2026-06-20', '2026-07-01', now)).toMatch(/^Starts in \d+ days$/);
    expect(formatRankingPeriodLabel('in-progress', '2026-05-01', '2026-06-18', now)).toMatch(/^Ends in \d+ days$/);
    expect(formatRankingPeriodLabel('ended', '2026-05-01', '2026-05-31', now)).toBe('Ended');
  });

  it('formats not-started labels in minutes when under 1 hour', () => {
    expect(formatRankingPeriodLabel('not-started', '2026-06-04T12:30:00.000Z', '2026-06-05', now)).toBe(
      'Starts in 30 min'
    );
    expect(formatRankingPeriodLabel('not-started', '2026-06-04T12:01:00.000Z', '2026-06-05', now)).toBe(
      'Starts in 1 min'
    );
  });

  it('formats not-started labels in hours when under 1 day', () => {
    expect(formatRankingPeriodLabel('not-started', '2026-06-04T18:00:00.000Z', '2026-06-05', now)).toBe(
      'Starts in 6 hrs'
    );
    expect(formatRankingPeriodLabel('not-started', '2026-06-04T13:00:00.000Z', '2026-06-05', now)).toBe(
      'Starts in 1 hr'
    );
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

  it('falls back to Ended when in-progress state is stale relative to a datetime end', () => {
    expect(formatRankingPeriodLabel('in-progress', '2026-05-01', '2026-06-04T10:00:00.000Z', now)).toBe('Ended');
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

describe('msUntilRankingPeriodChange', () => {
  const renderedAt = (startDate: string, endDate: string, at: Date) => {
    const state = getRankingPeriodState(startDate, endDate, at);
    return `${state}|${formatRankingPeriodLabel(state, startDate, endDate, at)}`;
  };

  it('returns null when nothing can change again', () => {
    expect(msUntilRankingPeriodChange('', '', now)).toBeNull();
    expect(msUntilRankingPeriodChange('2026-05-01', '2026-06-04T10:00:00.000Z', now)).toBeNull();
    expect(msUntilRankingPeriodChange('2026-05-01', '', now)).toBeNull();
  });

  it.each([
    ['ends within the minute', '2026-05-01', '2026-06-04T12:00:30.000Z'],
    ['ends on a minute boundary', '2026-05-01', '2026-06-04T12:05:00.000Z'],
    ['ends off a minute boundary', '2026-05-01', '2026-06-04T12:05:20.000Z'],
    ['ends in hours', '2026-05-01', '2026-06-04T18:30:00.000Z'],
    ['crosses from hours into minutes', '2026-05-01', '2026-06-04T13:00:00.000Z'],
    ['crosses from days into hours', '2026-05-01', '2026-06-05T11:30:00.000Z'],
    ['starts in minutes', '2026-06-04T12:05:00.000Z', '2026-06-30'],
    ['starts in hours', '2026-06-04T18:00:00.000Z', '2026-06-30'],
  ])('ticks exactly when %s changes what is rendered', (_label, startDate, endDate) => {
    const delay = msUntilRankingPeriodChange(startDate, endDate, now);
    expect(delay).not.toBeNull();

    const rendered = renderedAt(startDate, endDate, now);
    const justBeforeTick = new Date(now.getTime() + delay! - 1);
    const atTick = new Date(now.getTime() + delay!);

    expect(renderedAt(startDate, endDate, justBeforeTick)).toBe(rendered);
    expect(renderedAt(startDate, endDate, atTick)).not.toBe(rendered);
  });

  it('ticks at local midnight while the countdown is still counting calendar days', () => {
    const endDate = '2026-06-20T12:00:00.000Z';
    const untilMidnight = startOfDay(addDays(now, 1)).getTime() - now.getTime();

    expect(msUntilRankingPeriodChange('2026-05-01', endDate, now)).toBe(untilMidnight);

    const rendered = renderedAt('2026-05-01', endDate, now);
    expect(renderedAt('2026-05-01', endDate, new Date(now.getTime() + untilMidnight - 1))).toBe(rendered);
    expect(renderedAt('2026-05-01', endDate, new Date(now.getTime() + untilMidnight))).not.toBe(rendered);
  });
});
