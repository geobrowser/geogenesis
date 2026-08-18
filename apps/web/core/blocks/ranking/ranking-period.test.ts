import { addDays, startOfDay } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { type RankingDate } from './ranking-block-dates';
import {
  formatRankingPeriodLabel,
  getRankingPeriodState,
  msUntilRankingPeriodChange,
  rankingSubmissionsOpen,
} from './ranking-period';

const now = new Date('2026-06-04T12:00:00.000Z');

const localNoon = new Date(2026, 5, 4, 12, 0, 0);

const only = (value: string): RankingDate => ({ value, isDateOnly: true });
const dt = (value: string): RankingDate => ({ value, isDateOnly: false });
const none = dt('');

describe('getRankingPeriodState', () => {
  it('returns no-date when both dates are empty', () => {
    expect(getRankingPeriodState(none, none, now)).toBe('no-date');
  });

  it('returns not-started before the start date', () => {
    expect(getRankingPeriodState(only('2026-06-20'), only('2026-07-01'), now)).toBe('not-started');
  });

  it('returns in-progress between start and end', () => {
    expect(getRankingPeriodState(only('2026-05-01'), only('2026-06-30'), now)).toBe('in-progress');
  });

  it('returns ended after the end date', () => {
    expect(getRankingPeriodState(only('2026-05-01'), only('2026-05-31'), now)).toBe('ended');
  });

  it('returns in-progress with only an end date in the future', () => {
    expect(getRankingPeriodState(none, only('2026-06-30'), now)).toBe('in-progress');
  });

  it('returns ended when a datetime end time has already passed today', () => {
    expect(getRankingPeriodState(only('2026-05-01'), dt('2026-06-04T10:00:00.000Z'), now)).toBe('ended');
  });

  it('keeps date-only end dates in progress through the end calendar day', () => {
    expect(getRankingPeriodState(only('2026-05-01'), only('2026-06-04'), localNoon)).toBe('in-progress');
  });

  it('ends a date-only ranking once its end day has passed', () => {
    expect(getRankingPeriodState(only('2026-05-01'), only('2026-06-03'), localNoon)).toBe('ended');
  });

  // A legacy DATE value can be stored as a full midnight-UTC ISO string.
  it('applies calendar-day semantics to date-only values stored as midnight-UTC ISO', () => {
    expect(
      getRankingPeriodState(
        only('2026-05-01T00:00:00.000Z'),
        only('2026-06-04T00:00:00.000Z'),
        new Date('2026-06-04T00:00:00.000Z')
      )
    ).toBe('in-progress');

    expect(
      getRankingPeriodState(
        only('2026-05-01T00:00:00.000Z'),
        only('2026-06-04T00:00:00.000Z'),
        new Date('2026-06-05T00:00:00.000Z')
      )
    ).toBe('ended');
  });

  it('applies timestamp semantics to a datetime that happens to be midnight UTC', () => {
    expect(
      getRankingPeriodState(
        only('2026-05-01T00:00:00.000Z'),
        dt('2026-06-04T00:00:00.000Z'),
        new Date('2026-06-04T00:00:00.000Z')
      )
    ).toBe('ended');
  });
});

describe('formatRankingPeriodLabel', () => {
  it('formats labels for each state', () => {
    expect(formatRankingPeriodLabel('no-date', none, none, now)).toBeNull();
    expect(formatRankingPeriodLabel('not-started', only('2026-06-20'), only('2026-07-01'), now)).toMatch(
      /^Starts in \d+ days$/
    );
    expect(formatRankingPeriodLabel('in-progress', only('2026-05-01'), only('2026-06-18'), now)).toMatch(
      /^Ends in \d+ days$/
    );
    expect(formatRankingPeriodLabel('ended', only('2026-05-01'), only('2026-05-31'), now)).toBe('Ended');
  });

  it('formats not-started labels in minutes when under 1 hour', () => {
    expect(formatRankingPeriodLabel('not-started', dt('2026-06-04T12:30:00.000Z'), only('2026-06-05'), now)).toBe(
      'Starts in 30 min'
    );
    expect(formatRankingPeriodLabel('not-started', dt('2026-06-04T12:01:00.000Z'), only('2026-06-05'), now)).toBe(
      'Starts in 1 min'
    );
  });

  it('formats not-started labels in hours when under 1 day', () => {
    expect(formatRankingPeriodLabel('not-started', dt('2026-06-04T18:00:00.000Z'), only('2026-06-05'), now)).toBe(
      'Starts in 6 hrs'
    );
    expect(formatRankingPeriodLabel('not-started', dt('2026-06-04T13:00:00.000Z'), only('2026-06-05'), now)).toBe(
      'Starts in 1 hr'
    );
  });

  it('formats in-progress labels in minutes when under 1 hour', () => {
    expect(formatRankingPeriodLabel('in-progress', only('2026-05-01'), dt('2026-06-04T12:30:00.000Z'), now)).toBe(
      'Ends in 30 min'
    );
    expect(formatRankingPeriodLabel('in-progress', only('2026-05-01'), dt('2026-06-04T12:01:00.000Z'), now)).toBe(
      'Ends in 1 min'
    );
  });

  it('formats in-progress labels in hours when under 1 day', () => {
    expect(formatRankingPeriodLabel('in-progress', only('2026-05-01'), dt('2026-06-04T18:00:00.000Z'), now)).toBe(
      'Ends in 6 hrs'
    );
    expect(formatRankingPeriodLabel('in-progress', only('2026-05-01'), dt('2026-06-04T13:00:00.000Z'), now)).toBe(
      'Ends in 1 hr'
    );
  });

  it('falls back to Ended when in-progress state is stale relative to a datetime end', () => {
    expect(formatRankingPeriodLabel('in-progress', only('2026-05-01'), dt('2026-06-04T10:00:00.000Z'), now)).toBe(
      'Ended'
    );
  });

  it('says Ends today on the final day of a date-only window', () => {
    expect(formatRankingPeriodLabel('in-progress', only('2026-05-01'), only('2026-06-04'), localNoon)).toBe(
      'Ends today'
    );
  });

  it('counts whole days on the eve of a date-only window, not minutes to midnight', () => {
    expect(formatRankingPeriodLabel('in-progress', only('2026-05-01'), only('2026-06-05'), localNoon)).toBe(
      'Ends in 1 day'
    );
    expect(formatRankingPeriodLabel('not-started', only('2026-06-05'), only('2026-06-30'), localNoon)).toBe(
      'Starts in 1 day'
    );
  });

  it('never disagrees with the state it was given for a date-only window', () => {
    for (const endDate of ['2026-06-03', '2026-06-04', '2026-06-05', '2026-06-20']) {
      const state = getRankingPeriodState(only('2026-05-01'), only(endDate), localNoon);
      const label = formatRankingPeriodLabel(state, only('2026-05-01'), only(endDate), localNoon);

      if (rankingSubmissionsOpen(state)) {
        expect(label, `open ranking ending ${endDate} must not read as closed`).not.toBe('Ended');
      } else {
        expect(label, `closed ranking ending ${endDate}`).toBe('Ended');
      }
    }
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
  const renderedAt = (startDate: RankingDate, endDate: RankingDate, at: Date) => {
    const state = getRankingPeriodState(startDate, endDate, at);
    return `${state}|${formatRankingPeriodLabel(state, startDate, endDate, at)}`;
  };

  it('returns null when nothing can change again', () => {
    expect(msUntilRankingPeriodChange(none, none, now)).toBeNull();
    expect(msUntilRankingPeriodChange(only('2026-05-01'), dt('2026-06-04T10:00:00.000Z'), now)).toBeNull();
    expect(msUntilRankingPeriodChange(only('2026-05-01'), none, now)).toBeNull();
  });

  it.each([
    ['ends within the minute', only('2026-05-01'), dt('2026-06-04T12:00:30.000Z')],
    ['ends on a minute boundary', only('2026-05-01'), dt('2026-06-04T12:05:00.000Z')],
    ['ends off a minute boundary', only('2026-05-01'), dt('2026-06-04T12:05:20.000Z')],
    ['ends in hours', only('2026-05-01'), dt('2026-06-04T18:30:00.000Z')],
    ['crosses from hours into minutes', only('2026-05-01'), dt('2026-06-04T13:00:00.000Z')],
    ['crosses from days into hours', only('2026-05-01'), dt('2026-06-05T11:30:00.000Z')],
    ['starts in minutes', dt('2026-06-04T12:05:00.000Z'), only('2026-06-30')],
    ['starts in hours', dt('2026-06-04T18:00:00.000Z'), only('2026-06-30')],
  ])('ticks exactly when %s changes what is rendered', (_label, startDate, endDate) => {
    const delay = msUntilRankingPeriodChange(startDate, endDate, now);
    expect(delay).not.toBeNull();

    const rendered = renderedAt(startDate, endDate, now);
    const justBeforeTick = new Date(now.getTime() + delay! - 1);
    const atTick = new Date(now.getTime() + delay!);

    expect(renderedAt(startDate, endDate, justBeforeTick)).toBe(rendered);
    expect(renderedAt(startDate, endDate, atTick)).not.toBe(rendered);
  });

  it('ticks a date-only window at local midnight, which is the only time it can change', () => {
    const untilMidnight = startOfDay(addDays(localNoon, 1)).getTime() - localNoon.getTime();

    expect(msUntilRankingPeriodChange(only('2026-05-01'), only('2026-06-04'), localNoon)).toBe(untilMidnight);

    const justBefore = new Date(localNoon.getTime() + untilMidnight - 1);
    const atTick = new Date(localNoon.getTime() + untilMidnight);

    expect(getRankingPeriodState(only('2026-05-01'), only('2026-06-04'), justBefore)).toBe('in-progress');
    expect(getRankingPeriodState(only('2026-05-01'), only('2026-06-04'), atTick)).toBe('ended');
  });

  it('ticks at local midnight while the countdown is still counting calendar days', () => {
    const endDate = dt('2026-06-20T12:00:00.000Z');
    const untilMidnight = startOfDay(addDays(now, 1)).getTime() - now.getTime();

    expect(msUntilRankingPeriodChange(only('2026-05-01'), endDate, now)).toBe(untilMidnight);

    const rendered = renderedAt(only('2026-05-01'), endDate, now);
    expect(renderedAt(only('2026-05-01'), endDate, new Date(now.getTime() + untilMidnight - 1))).toBe(rendered);
    expect(renderedAt(only('2026-05-01'), endDate, new Date(now.getTime() + untilMidnight))).not.toBe(rendered);
  });
});
