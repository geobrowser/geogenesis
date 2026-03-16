import { describe, expect, it } from 'vitest';

import { formatSchedule, parseSchedule, serializeSchedule, validateSchedule } from './schedule';

describe('validateSchedule', () => {
  it('accepts a valid schedule with DTSTART only', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a valid schedule with DTSTART, DTEND, and RRULE', () => {
    const result = validateSchedule(
      'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH'
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a schedule without trailing Z on dates', () => {
    const result = validateSchedule('DTSTART:20260305T170000\nDTEND:20260305T180000');
    expect(result.valid).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = validateSchedule('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Schedule cannot be empty');
  });

  it('rejects when DTSTART is missing', () => {
    const result = validateSchedule('DTEND:20260305T180000Z');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('DTSTART is required');
  });

  it('rejects an invalid DTSTART date format', () => {
    const result = validateSchedule('DTSTART:2026-03-05');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid DTSTART date');
  });

  it('rejects an impossible date (Feb 30)', () => {
    const result = validateSchedule('DTSTART:20260230T170000Z');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid DTSTART date');
  });

  it('rejects DTEND before DTSTART', () => {
    const result = validateSchedule('DTSTART:20260305T180000Z\nDTEND:20260305T170000Z');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('DTEND must be after DTSTART');
  });

  it('rejects DTEND equal to DTSTART', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nDTEND:20260305T170000Z');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('DTEND must be after DTSTART');
  });

  it('rejects an invalid RRULE frequency', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nRRULE:FREQ=BIWEEKLY');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid frequency');
  });

  it('rejects an invalid RRULE day', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nRRULE:FREQ=WEEKLY;BYDAY=XX');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid day');
  });

  it('rejects RRULE without FREQ', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nRRULE:BYDAY=MO');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('RRULE must include a FREQ (e.g. FREQ=WEEKLY)');
  });

  it('rejects unknown properties', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nFOO:bar');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Unknown property "FOO"');
  });

  it('rejects duplicate properties', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nDTSTART:20260306T170000Z');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate property "DTSTART"');
  });

  it('rejects lines without a colon', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nbadline');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid line');
  });

  it('rejects invalid INTERVAL', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nRRULE:FREQ=WEEKLY;INTERVAL=0');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('INTERVAL must be a positive integer');
  });

  it('accepts valid INTERVAL and COUNT', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=10');
    expect(result.valid).toBe(true);
  });

  it('accepts multiple BYDAY values', () => {
    const result = validateSchedule('DTSTART:20260305T170000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(result.valid).toBe(true);
  });
});

describe('parseSchedule', () => {
  it('parses a full schedule string', () => {
    const result = parseSchedule('DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH');
    expect(result.startDate).toBe('2026-03-05');
    expect(result.startTime).toBe('17:00');
    expect(result.endTime).toBe('18:00');
    expect(result.freq).toBe('WEEKLY');
    expect(result.byDay).toEqual(['TH']);
    expect(result.interval).toBe(1);
  });

  it('parses DTSTART only', () => {
    const result = parseSchedule('DTSTART:20260101T090000Z');
    expect(result.startDate).toBe('2026-01-01');
    expect(result.startTime).toBe('09:00');
    expect(result.endTime).toBe('');
    expect(result.freq).toBe('');
    expect(result.byDay).toEqual([]);
  });

  it('parses schedule with interval', () => {
    const result = parseSchedule('DTSTART:20260305T170000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR');
    expect(result.interval).toBe(2);
    expect(result.byDay).toEqual(['MO', 'FR']);
  });

  it('returns defaults for empty string', () => {
    const result = parseSchedule('');
    expect(result.startDate).toBe('');
    expect(result.startTime).toBe('09:00');
    expect(result.endTime).toBe('');
    expect(result.freq).toBe('');
  });
});

describe('serializeSchedule', () => {
  it('serializes a full schedule', () => {
    const serialized = serializeSchedule({
      startDate: '2026-03-05',
      startTime: '17:00',
      endTime: '18:00',
      freq: 'WEEKLY',
      byDay: ['TH'],
      interval: 1,
    });
    expect(serialized).toBe('DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH');
  });

  it('serializes DTSTART only', () => {
    const serialized = serializeSchedule({
      startDate: '2026-01-01',
      startTime: '09:00',
      endTime: '',
      freq: '',
      byDay: [],
      interval: 1,
    });
    expect(serialized).toBe('DTSTART:20260101T090000Z');
  });

  it('serializes with interval', () => {
    const serialized = serializeSchedule({
      startDate: '2026-03-05',
      startTime: '17:00',
      endTime: '',
      freq: 'WEEKLY',
      byDay: ['MO', 'FR'],
      interval: 2,
    });
    expect(serialized).toBe('DTSTART:20260305T170000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR');
  });

  it('returns empty string when no start date', () => {
    const serialized = serializeSchedule({
      startDate: '',
      startTime: '09:00',
      endTime: '',
      freq: '',
      byDay: [],
      interval: 1,
    });
    expect(serialized).toBe('');
  });

  it('roundtrips through parse and serialize', () => {
    const original = 'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH';
    const parsed = parseSchedule(original);
    const serialized = serializeSchedule(parsed);
    expect(serialized).toBe(original);
  });
});

describe('formatSchedule', () => {
  it('formats a weekly recurring schedule with time range', () => {
    const formatted = formatSchedule(
      'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH'
    );
    expect(formatted).toContain('Weekly on Thursday');
    expect(formatted).toContain('5:00 PM');
    expect(formatted).toContain('6:00 PM');
    expect(formatted).toContain('UTC');
    expect(formatted).toContain('Starting');
  });

  it('formats a daily schedule', () => {
    const formatted = formatSchedule('DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY');
    expect(formatted).toContain('Daily');
    expect(formatted).toContain('9:00 AM');
  });

  it('formats a monthly schedule', () => {
    const formatted = formatSchedule('DTSTART:20260115T140000Z\nRRULE:FREQ=MONTHLY');
    expect(formatted).toContain('Monthly');
  });

  it('formats a schedule with interval', () => {
    const formatted = formatSchedule('DTSTART:20260305T170000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO');
    expect(formatted).toContain('Every 2 weeks on Monday');
  });

  it('formats multiple days', () => {
    const formatted = formatSchedule('DTSTART:20260305T170000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(formatted).toContain('Monday');
    expect(formatted).toContain('Wednesday');
    expect(formatted).toContain('Friday');
  });

  it('formats DTSTART only (no RRULE)', () => {
    const formatted = formatSchedule('DTSTART:20260305T170000Z');
    expect(formatted).toContain('5:00 PM UTC');
    expect(formatted).toContain('Starting');
    expect(formatted).not.toContain('Weekly');
  });

  it('formats noon correctly as 12 PM', () => {
    const formatted = formatSchedule('DTSTART:20260305T120000Z');
    expect(formatted).toContain('12:00 PM');
  });

  it('formats midnight correctly as 12 AM', () => {
    const formatted = formatSchedule('DTSTART:20260305T000000Z');
    expect(formatted).toContain('12:00 AM');
  });

  it('returns the raw string for unparseable input', () => {
    const raw = 'totally invalid';
    expect(formatSchedule(raw)).toBe(raw);
  });
});
