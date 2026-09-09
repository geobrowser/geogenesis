import { describe, expect, it } from 'vitest';

import {
  type DebateHoursConfig,
  debateHoursNote,
  debateHoursWindow,
  formatLocalDebateHours,
  parseDebateHours,
} from './debate-hours';

const PACIFIC_9_TO_10: DebateHoursConfig = { timeZone: 'America/Los_Angeles', start: '09:00', end: '10:00' };

/**
 * `formatLocalDebateHours` reads the *runtime's* zone, because that is what "the viewer's local
 * time" means — and the suite sets no `TZ`, so an assertion pinned to a UTC instant would come out
 * differently on every machine. Building the range from local-field `Date`s instead makes these
 * cases say what they mean whatever zone they run in: the formatter reads back the same wall clock
 * that went in.
 */
function range(startHour: number, startMinute: number, endHour: number, endMinute: number) {
  const start = new Date(2026, 8, 8, startHour, startMinute);
  const end = new Date(2026, 8, 8, endHour, endMinute);
  return { start, end };
}

describe('debateHoursWindow', () => {
  it('is open from the start of the window, inclusive', () => {
    // 2026-09-08 is PDT, UTC-7, so 09:00 PT is 16:00Z.
    const window = debateHoursWindow(new Date('2026-09-08T16:00:00Z'), PACIFIC_9_TO_10);

    expect(window.isOpen).toBe(true);
    expect(window.start.toISOString()).toBe('2026-09-08T16:00:00.000Z');
    // While open, the next flip is the window closing.
    expect(window.nextTransition.toISOString()).toBe('2026-09-08T17:00:00.000Z');
  });

  it('is closed one minute before the window opens, and points at that opening', () => {
    const window = debateHoursWindow(new Date('2026-09-08T15:59:00Z'), PACIFIC_9_TO_10);

    expect(window.isOpen).toBe(false);
    expect(window.nextTransition.toISOString()).toBe('2026-09-08T16:00:00.000Z');
  });

  it('is closed at the end of the window, exclusive, and rolls to tomorrow', () => {
    const window = debateHoursWindow(new Date('2026-09-08T17:00:00Z'), PACIFIC_9_TO_10);

    expect(window.isOpen).toBe(false);
    expect(window.start.toISOString()).toBe('2026-09-09T16:00:00.000Z');
    expect(window.nextTransition.toISOString()).toBe('2026-09-09T16:00:00.000Z');
  });

  // The whole reason the offset is not stored: the US leaves daylight saving on 2026-11-01, so the
  // same 09:00 PT window is 16:00Z the week before and 17:00Z the week after.
  it('tracks Pacific daylight saving across the November transition', () => {
    // Oct 30, 07:00 PDT — the window opens two hours later, still on daylight time.
    const beforeFallBack = debateHoursWindow(new Date('2026-10-30T14:00:00Z'), PACIFIC_9_TO_10);
    // Nov 2, 12:00 PST — the next window is Nov 3, on standard time.
    const afterFallBack = debateHoursWindow(new Date('2026-11-02T20:00:00Z'), PACIFIC_9_TO_10);

    expect(beforeFallBack.start.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(afterFallBack.start.toISOString()).toBe('2026-11-03T17:00:00.000Z');
  });

  // A viewer far enough east is inside a window that started on the previous Pacific calendar day,
  // which is only found by looking back a day as well as forward.
  it('finds the open window when it began on the previous day in Pacific', () => {
    // 22:00-23:00 PT on the 8th is 05:00-06:00Z on the 9th.
    const overnight: DebateHoursConfig = { timeZone: 'America/Los_Angeles', start: '22:00', end: '23:00' };
    const window = debateHoursWindow(new Date('2026-09-09T05:30:00Z'), overnight);

    expect(window.isOpen).toBe(true);
    expect(window.start.toISOString()).toBe('2026-09-09T05:00:00.000Z');
  });

  it('closes a configured window that crosses midnight in its own zone on the following day', () => {
    const acrossMidnight: DebateHoursConfig = { timeZone: 'America/Los_Angeles', start: '23:00', end: '01:00' };
    const window = debateHoursWindow(new Date('2026-09-09T07:00:00Z'), acrossMidnight);

    // 23:00 PT on the 8th → 06:00Z on the 9th; 01:00 PT on the 9th → 08:00Z.
    expect(window.isOpen).toBe(true);
    expect(window.start.toISOString()).toBe('2026-09-09T06:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-09-09T08:00:00.000Z');
  });
});

describe('formatLocalDebateHours', () => {
  it('drops the leading meridiem when both ends share one', () => {
    expect(formatLocalDebateHours(range(9, 0, 10, 0))).toBe('9-10am');
    expect(formatLocalDebateHours(range(17, 0, 18, 0))).toBe('5-6pm');
  });

  it('keeps both meridiems when the window crosses noon or midnight', () => {
    expect(formatLocalDebateHours(range(11, 0, 12, 0))).toBe('11am-12pm');
    expect(formatLocalDebateHours(range(23, 0, 0, 0))).toBe('11pm-12am');
  });

  // The overnight case GEO-2840 asks about: a Tokyo viewer sees 1-2am, which is as true every day
  // as 9-10am is in Pacific, so it carries no day name.
  it('reads sensibly overnight', () => {
    expect(formatLocalDebateHours(range(1, 0, 2, 0))).toBe('1-2am');
    expect(formatLocalDebateHours(range(2, 0, 3, 0))).toBe('2-3am');
  });

  it('shows minutes only when there are any', () => {
    expect(formatLocalDebateHours(range(9, 30, 10, 15))).toBe('9:30-10:15am');
    expect(formatLocalDebateHours(range(12, 0, 13, 0))).toBe('12-1pm');
  });
});

describe('debateHoursNote', () => {
  const closed = { isOpen: false, ...range(9, 0, 10, 0), nextTransition: new Date() };
  const open = { isOpen: true, ...range(9, 0, 10, 0), nextTransition: new Date() };

  it.each([true, false])('tells an outside-hours viewer when to come back, in their own time (live=%s)', live => {
    // Nothing is coming for anyone outside the window, so `live` has nothing to change here.
    expect(debateHoursNote(closed, { live })).toBe(
      'Debate hours are every day between 9-10am. Come back then to join a debate!'
    );
  });

  // A signed-in list live-updates off `debate.matchmaking_changed`, so "check back later" would
  // send people away from the only place the match can happen.
  it('tells an in-hours viewer on a live list to stay', () => {
    expect(debateHoursNote(open, { live: true })).toBe('Stay here and you’ll be matched as soon as someone joins.');
  });

  // Signed out on People there is no gateway scope behind the list and no matching to wait for, so
  // "stay here and you'll be matched" would promise two things that cannot happen.
  it('tells an in-hours viewer on a static list to check back', () => {
    expect(debateHoursNote(open, { live: false })).toBe('Check back in a few minutes to find a debate!');
  });
});

describe('parseDebateHours', () => {
  it('reads a range, with and without a zone', () => {
    expect(parseDebateHours('09:00-10:00')).toEqual(PACIFIC_9_TO_10);
    expect(parseDebateHours('18:00-19:30@Europe/London')).toEqual({
      timeZone: 'Europe/London',
      start: '18:00',
      end: '19:30',
    });
  });

  // A deploy variable is not worth a crashed tab, so every bad shape lands on the default. The
  // trailing three are the ones a lenient parser would accept while quietly dropping the part it
  // could not use — stating a window nobody chose, which is worse than ignoring the variable.
  it.each([
    '',
    undefined,
    'nonsense',
    '9-10',
    '25:00-26:00',
    '09:00',
    '09:00-10:00@Not/AZone',
    '09:00-10:00-11:00',
    '09:00-10:00@UTC@typo',
  ])('falls back to 9-10am Pacific for %j', value => {
    expect(parseDebateHours(value)).toEqual(PACIFIC_9_TO_10);
  });
});
