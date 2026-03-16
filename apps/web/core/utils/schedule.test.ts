import { describe, expect, it } from 'vitest';

import { formatSchedule, validateSchedule } from './schedule';

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
