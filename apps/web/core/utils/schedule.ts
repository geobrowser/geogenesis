/**
 * Utilities for parsing and validating iCalendar/RRULE schedule strings.
 *
 * Schedule format example:
 *   "DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH"
 */

const DAY_NAMES: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

const VALID_DAYS = new Set(Object.keys(DAY_NAMES));

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

const VALID_FREQS = new Set(Object.keys(FREQ_LABELS));

const ICAL_DATE_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/;

const KNOWN_PROPS = new Set(['DTSTART', 'DTEND', 'RRULE']);

export interface ScheduleValidationResult {
  valid: boolean;
  errors: string[];
}

function parseICalDate(value: string): Date | null {
  const match = value.match(ICAL_DATE_RE);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

function isValidICalDate(value: string): boolean {
  const match = value.match(ICAL_DATE_RE);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match;
  const m = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const min = Number(minute);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (h > 23) return false;
  if (min > 59) return false;
  // Verify the date actually exists (e.g. Feb 30 would shift)
  const date = parseICalDate(value);
  if (!date) return false;
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return false;
  return true;
}

function validateRRule(rrule: string): string[] {
  const errors: string[] = [];
  const parts = rrule.split(';');
  let hasFreq = false;

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) {
      errors.push(`Invalid RRULE part: "${part}" (missing "=")`);
      continue;
    }
    const key = part.substring(0, eqIdx);
    const val = part.substring(eqIdx + 1);

    switch (key) {
      case 'FREQ':
        hasFreq = true;
        if (!VALID_FREQS.has(val)) {
          errors.push(`Invalid frequency "${val}". Must be one of: ${[...VALID_FREQS].join(', ')}`);
        }
        break;
      case 'BYDAY': {
        const days = val.split(',');
        for (const day of days) {
          if (!VALID_DAYS.has(day)) {
            errors.push(`Invalid day "${day}". Must be one of: ${[...VALID_DAYS].join(', ')}`);
          }
        }
        break;
      }
      case 'INTERVAL': {
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1) {
          errors.push(`INTERVAL must be a positive integer, got "${val}"`);
        }
        break;
      }
      case 'COUNT': {
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1) {
          errors.push(`COUNT must be a positive integer, got "${val}"`);
        }
        break;
      }
    }
  }

  if (!hasFreq) {
    errors.push('RRULE must include a FREQ (e.g. FREQ=WEEKLY)');
  }

  return errors;
}

/**
 * Validates an iCalendar schedule string.
 * Requires at least a DTSTART line. DTEND and RRULE are optional.
 */
export function validateSchedule(schedule: string): ScheduleValidationResult {
  const errors: string[] = [];

  if (!schedule.trim()) {
    return { valid: false, errors: ['Schedule cannot be empty'] };
  }

  const lines = schedule.split('\n').filter(l => l.trim());
  const props: Record<string, string> = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      errors.push(`Invalid line: "${line}" (missing ":")`);
      continue;
    }
    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();

    if (!KNOWN_PROPS.has(key)) {
      errors.push(`Unknown property "${key}". Supported: ${[...KNOWN_PROPS].join(', ')}`);
      continue;
    }

    if (props[key]) {
      errors.push(`Duplicate property "${key}"`);
      continue;
    }

    props[key] = value;
  }

  if (!props.DTSTART) {
    errors.push('DTSTART is required');
  } else if (!isValidICalDate(props.DTSTART)) {
    errors.push(`Invalid DTSTART date "${props.DTSTART}". Expected format: YYYYMMDDTHHmmSSZ`);
  }

  if (props.DTEND) {
    if (!isValidICalDate(props.DTEND)) {
      errors.push(`Invalid DTEND date "${props.DTEND}". Expected format: YYYYMMDDTHHmmSSZ`);
    } else if (props.DTSTART && isValidICalDate(props.DTSTART)) {
      const start = parseICalDate(props.DTSTART)!;
      const end = parseICalDate(props.DTEND)!;
      if (end <= start) {
        errors.push('DTEND must be after DTSTART');
      }
    }
  }

  if (props.RRULE) {
    errors.push(...validateRRule(props.RRULE));
  }

  return { valid: errors.length === 0, errors };
}

function formatTime(date: Date): string {
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const h12 = hours % 12 || 12;
  const meridiem = hours < 12 ? 'AM' : 'PM';
  const min = minutes.toString().padStart(2, '0');
  return `${h12}:${min} ${meridiem}`;
}

function parseRRule(rrule: string): { freq?: string; byDay?: string[]; interval?: number; count?: number } {
  const parts = rrule.split(';');
  const result: { freq?: string; byDay?: string[]; interval?: number; count?: number } = {};

  for (const part of parts) {
    const [key, val] = part.split('=');
    switch (key) {
      case 'FREQ':
        result.freq = val;
        break;
      case 'BYDAY':
        result.byDay = val.split(',');
        break;
      case 'INTERVAL':
        result.interval = Number(val);
        break;
      case 'COUNT':
        result.count = Number(val);
        break;
    }
  }

  return result;
}

export function formatSchedule(schedule: string): string {
  const lines = schedule.split('\n');
  const props: Record<string, string> = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    const value = line.substring(colonIdx + 1).trim();
    props[key] = value;
  }

  const parts: string[] = [];

  // Recurrence
  if (props.RRULE) {
    const rrule = parseRRule(props.RRULE);
    const freqLabel = rrule.freq ? FREQ_LABELS[rrule.freq] ?? rrule.freq : '';

    if (rrule.byDay && rrule.byDay.length > 0) {
      const dayNames = rrule.byDay.map(d => DAY_NAMES[d] ?? d);
      const interval = rrule.interval && rrule.interval > 1 ? `Every ${rrule.interval} weeks` : freqLabel;
      parts.push(`${interval} on ${dayNames.join(', ')}`);
    } else if (rrule.interval && rrule.interval > 1) {
      const unit =
        rrule.freq === 'DAILY'
          ? 'days'
          : rrule.freq === 'WEEKLY'
            ? 'weeks'
            : rrule.freq === 'MONTHLY'
              ? 'months'
              : 'years';
      parts.push(`Every ${rrule.interval} ${unit}`);
    } else {
      parts.push(freqLabel);
    }
  }

  // Time range
  const startDate = props.DTSTART ? parseICalDate(props.DTSTART) : null;
  const endDate = props.DTEND ? parseICalDate(props.DTEND) : null;

  if (startDate && endDate) {
    parts.push(`${formatTime(startDate)} – ${formatTime(endDate)} UTC`);
  } else if (startDate) {
    parts.push(`${formatTime(startDate)} UTC`);
  }

  // Starting date
  if (startDate) {
    const dateStr = startDate.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    parts.push(`Starting ${dateStr}`);
  }

  return parts.join(' · ') || schedule;
}
