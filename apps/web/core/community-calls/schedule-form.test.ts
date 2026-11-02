import { describe, expect, it } from 'vitest';

import { validateSchedule } from '~/core/utils/schedule';

import { editedSchedule, storedScheduleFields } from './schedule-form';

const LAGOS = 'DTSTART;TZID=Africa/Lagos:20261103T180000\nDTEND;TZID=Africa/Lagos:20261103T190000\nRRULE:FREQ=WEEKLY';
const THIRD_MONDAY =
  'DTSTART;TZID=America/New_York:20261116T120000\nDTEND;TZID=America/New_York:20261116T130000\nRRULE:FREQ=MONTHLY;BYDAY=3MO';
const UTC_WEEKLY = 'DTSTART:20261103T170000Z\nDTEND:20261103T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU';

const fieldsOf = (schedule: string) => storedScheduleFields(schedule)!.fields;

describe('storedScheduleFields', () => {
  it('reads the fields in the schedule’s own zone', () => {
    expect(storedScheduleFields(LAGOS)).toEqual({
      fields: { startDate: '2026-11-03', startTime: '18:00', endTime: '19:00', repeat: 'WEEKLY' },
      byDay: [],
      timezone: 'Africa/Lagos',
    });
    expect(storedScheduleFields(UTC_WEEKLY)?.timezone).toBeUndefined();
  });

  it('accepts what differs only in RRULE part order or a default interval', () => {
    expect(storedScheduleFields('DTSTART:20261103T170000Z\nRRULE:BYDAY=TU;INTERVAL=1;FREQ=WEEKLY')).not.toBeNull();
  });

  it.each([
    ['a COUNT', 'DTSTART:20261103T170000Z\nRRULE:FREQ=WEEKLY;COUNT=4'],
    ['a yearly repeat', 'DTSTART:20261103T170000Z\nRRULE:FREQ=YEARLY'],
    ['a three-week interval', 'DTSTART:20261103T170000Z\nRRULE:FREQ=WEEKLY;INTERVAL=3'],
    ['seconds', 'DTSTART:20261103T170030Z'],
    ['nothing', ''],
  ])('cannot hold a schedule with %s', (_label, schedule) => {
    expect(storedScheduleFields(schedule)).toBeNull();
  });
});

describe('editedSchedule', () => {
  it.each([
    ['a Lagos series', LAGOS],
    ['a third-Monday series', THIRD_MONDAY],
    ['a legacy UTC series', UTC_WEEKLY],
  ])('saves %s unchanged when only the name changed', (_label, schedule) => {
    expect(editedSchedule(schedule, fieldsOf(schedule))).toBe(schedule);
  });

  it('keeps the zone and BYDAY when the time changes', () => {
    expect(editedSchedule(THIRD_MONDAY, { ...fieldsOf(THIRD_MONDAY), startTime: '11:00' })).toBe(
      'DTSTART;TZID=America/New_York:20261116T110000\nDTEND;TZID=America/New_York:20261116T130000\nRRULE:FREQ=MONTHLY;BYDAY=3MO'
    );
    expect(editedSchedule(UTC_WEEKLY, { ...fieldsOf(UTC_WEEKLY), endTime: '18:30' })).toBe(
      'DTSTART:20261103T170000Z\nDTEND:20261103T183000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU'
    );
  });

  it('moves the weekday with the start date', () => {
    expect(editedSchedule(UTC_WEEKLY, { ...fieldsOf(UTC_WEEKLY), startDate: '2026-11-04' })).toBe(
      'DTSTART:20261104T170000Z\nDTEND:20261104T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=WE'
    );
    expect(editedSchedule(LAGOS, { ...fieldsOf(LAGOS), startDate: '2026-11-05' })).toBe(
      'DTSTART;TZID=Africa/Lagos:20261105T180000\nDTEND;TZID=Africa/Lagos:20261105T190000\nRRULE:FREQ=WEEKLY'
    );
    // Tuesday 1 December is the first Tuesday.
    expect(editedSchedule(THIRD_MONDAY, { ...fieldsOf(THIRD_MONDAY), startDate: '2026-12-01' })).toContain(
      'RRULE:FREQ=MONTHLY;BYDAY=1TU'
    );
  });

  it('keeps a last-weekday rule on a date in the month’s last week', () => {
    const lastFriday = 'DTSTART:20261127T170000Z\nRRULE:FREQ=MONTHLY;BYDAY=-1FR';
    expect(editedSchedule(lastFriday, { ...fieldsOf(lastFriday), startDate: '2026-12-31' })).toContain('BYDAY=-1TH');
  });

  it('drops BYDAY when the repeat changes', () => {
    expect(editedSchedule(THIRD_MONDAY, { ...fieldsOf(THIRD_MONDAY), repeat: 'WEEKLY' })).toContain(
      'RRULE:FREQ=WEEKLY'
    );
    expect(editedSchedule(THIRD_MONDAY, { ...fieldsOf(THIRD_MONDAY), repeat: 'WEEKLY' })).not.toContain('BYDAY');
  });

  it('keeps a schedule the fields cannot hold', () => {
    const counted = 'DTSTART:20261103T170000Z\nRRULE:FREQ=WEEKLY;COUNT=4';
    expect(editedSchedule(counted, { startDate: '2026-11-04', startTime: '09:00', endTime: '', repeat: 'none' })).toBe(
      counted
    );
  });

  it('writes schedules the validator accepts', () => {
    expect(validateSchedule(THIRD_MONDAY).valid).toBe(true);
    expect(validateSchedule('DTSTART:20261103T170000Z\nRRULE:FREQ=MONTHLY;BYDAY=6MO').valid).toBe(false);
  });
});
