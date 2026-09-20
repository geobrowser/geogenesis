import { describe, expect, it } from 'vitest';

import {
  fromPayload,
  type AvailabilityBlock,
  columnFor,
  effectiveAvailability,
  formatTime,
  isoDate,
  mergeBlocks,
  mondayOf,
  overlapDepths,
  slotsForRange,
  snapMinutes,
  toPayload,
  weekDates,
} from './blocks';

const at = (hour: number, minute = 0) => hour * 60 + minute;
const DATES = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];

const recurring = (weekday: number, start: number, end: number, id = `r${weekday}-${start}`): AvailabilityBlock => ({
  id,
  kind: 'recurring',
  weekday,
  start,
  end,
});
const dated = (date: string, start: number, end: number, id = `d${date}-${start}`): AvailabilityBlock => ({
  id,
  kind: 'dated',
  date,
  start,
  end,
});
const exception = (date: string, start: number, end: number, id = `x${date}-${start}`): AvailabilityBlock => ({
  id,
  kind: 'exception',
  date,
  start,
  end,
});

describe('snapping and formatting', () => {
  it('snaps to the half hour', () => {
    expect(snapMinutes(at(9, 7))).toBe(at(9));
    expect(snapMinutes(at(9, 20))).toBe(at(9, 30));
    expect(snapMinutes(at(9, 50))).toBe(at(10));
  });

  it('formats the grid labels', () => {
    expect(formatTime(at(9))).toBe('9am');
    expect(formatTime(at(9, 30))).toBe('9:30am');
    expect(formatTime(at(12))).toBe('12pm');
    expect(formatTime(at(0))).toBe('12am');
    expect(formatTime(at(13, 30))).toBe('1:30pm');
  });

  it('reads dates in local terms', () => {
    // Late evening west of UTC is already tomorrow in UTC; toISOString would name the wrong day.
    expect(isoDate(new Date(2026, 8, 18, 23, 30))).toBe('2026-09-18');
  });

  it('starts the week on Monday', () => {
    expect(isoDate(mondayOf(new Date(2026, 8, 18)))).toBe('2026-09-14'); // a Friday
    expect(isoDate(mondayOf(new Date(2026, 8, 20)))).toBe('2026-09-14'); // Sunday belongs to the week before
    expect(weekDates(mondayOf(new Date(2026, 8, 18))).map(isoDate)).toEqual(DATES);
  });
});

describe('mergeBlocks', () => {
  it('folds overlapping blocks of the same kind and day into one', () => {
    const merged = mergeBlocks([recurring(1, at(9), at(10)), recurring(1, at(9, 30), at(11))]);
    expect(merged).toHaveLength(1);
    expect([merged[0].start, merged[0].end]).toEqual([at(9), at(11)]);
  });

  it('folds blocks that merely touch', () => {
    const merged = mergeBlocks([recurring(1, at(9), at(10)), recurring(1, at(10), at(11))]);
    expect(merged).toHaveLength(1);
    expect([merged[0].start, merged[0].end]).toEqual([at(9), at(11)]);
  });

  it('keeps different days, different kinds and separated blocks apart', () => {
    const blocks = [
      recurring(1, at(9), at(10)),
      recurring(2, at(9), at(10)), // another weekday
      dated('2026-09-15', at(9), at(10)), // same day, another kind
      recurring(1, at(11), at(12)), // a gap
    ];
    expect(mergeBlocks(blocks)).toHaveLength(4);
  });

  it('does not mutate the blocks it is given', () => {
    const first = recurring(1, at(9), at(10));
    mergeBlocks([first, recurring(1, at(9, 30), at(11))]);
    expect(first.end).toBe(at(10));
  });
});

describe('effectiveAvailability', () => {
  it('offers recurring and dated blocks together', () => {
    const days = effectiveAvailability([recurring(1, at(9), at(10)), dated('2026-09-15', at(18), at(19))], DATES);
    expect(days[1].ranges).toEqual([
      [at(9), at(10)],
      [at(18), at(19)],
    ]);
  });

  it('removes an exception from the recurring block it overlaps', () => {
    const days = effectiveAvailability([recurring(1, at(9), at(12)), exception('2026-09-15', at(10), at(11))], DATES);
    // Split in two: the exception is a hole, not a truncation.
    expect(days[1].ranges).toEqual([
      [at(9), at(10)],
      [at(11), at(12)],
    ]);
  });

  it('leaves the same weekday in another week alone', () => {
    // The exception names one date; the recurring block still stands on every other Tuesday.
    const days = effectiveAvailability(
      [recurring(1, at(9), at(10)), exception('2026-09-15', at(9), at(10))],
      ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']
    );
    expect(days[1].ranges).toEqual([[at(9), at(10)]]);
  });

  it('can remove a window completely', () => {
    const days = effectiveAvailability([recurring(1, at(9), at(10)), exception('2026-09-15', at(8), at(11))], DATES);
    expect(days[1].ranges).toEqual([]);
  });

  it('merges an overlapping recurring and dated pair before subtracting', () => {
    const days = effectiveAvailability([recurring(1, at(9), at(11)), dated('2026-09-15', at(10), at(12))], DATES);
    expect(days[1].ranges).toEqual([[at(9), at(12)]]);
  });

  it('gives every day of the week, in order', () => {
    const days = effectiveAvailability([], DATES);
    expect(days.map(day => day.date)).toEqual(DATES);
    expect(days.every(day => day.ranges.length === 0)).toBe(true);
  });
});

describe('slotsForRange', () => {
  it('cuts a range into half-hour slot starts', () => {
    expect(slotsForRange([at(9), at(10, 30)])).toEqual([at(9), at(9, 30), at(10)]);
  });

  it('drops a tail too short to sit a slot in', () => {
    expect(slotsForRange([at(9), at(9, 20)])).toEqual([]);
  });
});

describe('columnFor', () => {
  it('places a recurring block by weekday and a dated one by date', () => {
    expect(columnFor(recurring(3, at(9), at(10)), DATES)).toBe(3);
    expect(columnFor(dated('2026-09-19', at(9), at(10)), DATES)).toBe(5);
  });

  it('returns null for a dated block in another week', () => {
    expect(columnFor(dated('2026-10-19', at(9), at(10)), DATES)).toBeNull();
  });
});

describe('overlapDepths', () => {
  it('leaves blocks that do not overlap at depth 0', () => {
    const depths = overlapDepths([recurring(1, at(9), at(10), 'a'), dated('2026-09-15', at(10), at(11), 'b')]);
    expect(depths.get('a')).toBe(0);
    expect(depths.get('b')).toBe(0);
  });

  it('steps an overlapping block to the right', () => {
    // An exception over the recurring block it removes time from — the case that needs to be seen.
    const depths = overlapDepths([recurring(1, at(9), at(12), 'a'), exception('2026-09-15', at(10), at(11), 'b')]);
    expect(depths.get('a')).toBe(0);
    expect(depths.get('b')).toBe(1);
  });

  it('keeps stepping as more blocks pile up, then resets once the column clears', () => {
    const depths = overlapDepths([
      recurring(1, at(9), at(12), 'a'),
      dated('2026-09-15', at(9, 30), at(11), 'b'),
      exception('2026-09-15', at(10), at(10, 30), 'c'),
      dated('2026-09-15', at(13), at(14), 'clear'),
    ]);
    expect([depths.get('a'), depths.get('b'), depths.get('c')]).toEqual([0, 1, 2]);
    expect(depths.get('clear')).toBe(0);
  });

  it('puts the shorter of two blocks that start together on top', () => {
    const depths = overlapDepths([recurring(1, at(9), at(10), 'short'), dated('2026-09-15', at(9), at(12), 'long')]);
    expect(depths.get('long')).toBe(0);
    expect(depths.get('short')).toBe(1);
  });

  it('treats a block starting exactly where another ends as clear of it', () => {
    const depths = overlapDepths([recurring(1, at(9), at(10), 'a'), dated('2026-09-15', at(10), at(11), 'b')]);
    expect(depths.get('b')).toBe(0);
  });
});

describe('toPayload', () => {
  it('sends 24-hour times and 1 = Monday weekdays', () => {
    const payload = toPayload([recurring(0, at(9), at(10, 30))], 'Europe/London');
    expect(payload).toEqual({
      timezone: 'Europe/London',
      slot_minutes: 30,
      recurring: [{ weekday: 1, start: '09:00', end: '10:30' }],
      dated: [],
    });
  });

  it('omits exceptions entirely when there are none', () => {
    expect(toPayload([dated('2026-09-19', at(11), at(13))], 'Europe/London')).not.toHaveProperty('exceptions');
  });

  it('separates the three kinds', () => {
    const payload = toPayload(
      [recurring(1, at(9), at(10)), dated('2026-09-19', at(11), at(13)), exception('2026-09-17', at(9), at(10))],
      'Europe/London'
    );
    expect(payload.recurring).toHaveLength(1);
    expect(payload.dated).toEqual([{ date: '2026-09-19', start: '11:00', end: '13:00' }]);
    expect(payload.exceptions).toEqual([{ date: '2026-09-17', start: '09:00', end: '10:00' }]);
  });
});

describe('fromPayload', () => {
  it('undoes the one-based weekday the wire uses', () => {
    // The wire counts Monday as 1 and the editor counts it as 0. A round trip that forgets this
    // moves a whole week by a day, and nothing throws.
    const [block] = fromPayload({
      timezone: 'Europe/London',
      slot_minutes: 30,
      recurring: [{ weekday: 1, start: '09:00', end: '10:00' }],
      dated: [],
    });
    expect(block).toMatchObject({ kind: 'recurring', weekday: 0, start: at(9), end: at(10) });
  });

  it('reads a payload with no exceptions key at all', () => {
    // `toPayload` omits it rather than sending [], so the inverse must not assume it is there.
    const blocks = fromPayload({
      timezone: 'Europe/London',
      slot_minutes: 30,
      recurring: [],
      dated: [{ date: '2026-09-19', start: '11:00', end: '13:30' }],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'dated', date: '2026-09-19' });
  });

  it('round-trips every kind without drift', () => {
    const original = [
      recurring(1, at(9), at(10)),
      recurring(3, at(18), at(20)),
      dated('2026-09-19', at(11), at(13, 30)),
      exception('2026-09-17', at(9), at(10)),
    ];
    const restored = fromPayload(toPayload(original, 'Europe/London'));

    // Ids are regenerated on read, so compare everything else.
    const shape = (blocks: AvailabilityBlock[]) =>
      blocks
        .map(({ id: _id, ...rest }) => rest)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    expect(shape(restored)).toEqual(shape(original));
  });
});
