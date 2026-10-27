/**
 * Utilities for parsing and validating iCalendar/RRULE schedule strings.
 *
 * Schedule format example (UTC, legacy):
 *   "DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH"
 *
 * Schedule format example (IANA timezone, DST-aware):
 *   "DTSTART;TZID=America/Los_Angeles:20260305T090000\nDTEND;TZID=America/Los_Angeles:20260305T100000\nRRULE:FREQ=WEEKLY;BYDAY=TH"
 *
 * When a TZID param is present, the DTSTART/DTEND digits are the organizer's local
 * wall clock in that zone (not UTC) — no trailing `Z`. Reads of legacy no-TZID
 * schedules are unaffected; only new writes (`serializeSchedule`) add TZID going
 * forward.
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

/** `MO`, or an RFC 5545 ordinal such as `3MO` or `-1FR`. */
function isValidByDay(token: string): boolean {
  if (VALID_DAYS.has(token)) return true;
  const match = /^([+-]?\d{1,2})([A-Z]{2})$/.exec(token);
  const n = match ? Math.abs(Number(match[1])) : 0;
  return Boolean(match && VALID_DAYS.has(match[2]) && n >= 1 && n <= 5);
}

const ORDINAL_NAMES: Record<string, string> = {
  '1': 'first',
  '2': 'second',
  '3': 'third',
  '4': 'fourth',
  '5': 'fifth',
  '-1': 'last',
  '-2': 'second to last',
};

/** "Monday", or "the third Monday" for an ordinal BYDAY such as `3MO` or `-1FR`. */
function byDayLabel(token: string): string {
  const match = /^([+-]?\d{1,2})([A-Z]{2})$/.exec(token);
  if (!match) return DAY_NAMES[token] ?? token;
  const ordinal = ORDINAL_NAMES[String(Number(match[1]))];
  const day = DAY_NAMES[match[2]];
  return ordinal && day ? `the ${ordinal} ${day}` : token;
}

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

const VALID_FREQS = new Set(Object.keys(FREQ_LABELS));

const ICAL_DATE_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/;

const KNOWN_PROPS = new Set(['DTSTART', 'DTEND', 'RRULE']);

/** Matches curator's bounds (`community-call-form/validation.ts`) for a single occurrence's length. */
export const MIN_CALL_DURATION_MINUTES = 15;
export const MAX_CALL_DURATION_MINUTES = 150;

export interface ScheduleValidationResult {
  valid: boolean;
  errors: string[];
}

/** The instant a valid iCal date names: TZID digits are that zone's wall clock, a `Z` value is UTC. */
function icalInstantMs(value: string, tzid: string | undefined): number {
  const naive = parseICalDate(value)!.getTime();
  return tzid && !value.endsWith('Z') ? localToUtcMs(naive, tzid) : naive;
}

/** A valid TZID date whose wall clock the zone skips; a `Z` value never is. */
function skipped(value: string, tzid: string | undefined): boolean {
  return Boolean(tzid) && !value.endsWith('Z') && isSkippedLocalTime(parseICalDate(value)!.getTime(), tzid!);
}

export const SKIPPED_TIME_ERROR = "That time doesn't exist on this date because of the clock change";

function parseICalDate(value: string): Date | null {
  const match = value.match(ICAL_DATE_RE);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

// Offset (ms) of `tz` from UTC at the real UTC instant `utcMs`: positive when the
// zone is ahead. Callers converting a *local* wall clock to UTC should not sample
// this directly at the naive (local-digits-as-UTC) value — see `localToUtcMs`.
//
// Schedule strings are graph data and can be published by any client, so a
// non-IANA TZID (e.g. a Windows zone name from an Outlook-exported ICS) is
// untrusted input — Intl.DateTimeFormat throws RangeError for those, so treat
// an invalid tz as "no offset" rather than crashing the caller.
export function tzOffsetMs(tz: string, utcMs: number): number {
  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 0;
  }
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The true instants whose wall clock in `tz` reads `naiveMs`: none in a DST gap, two in a repeated hour. */
function localInstants(naiveMs: number, tz: string): number[] {
  const offsets = new Set([tzOffsetMs(tz, naiveMs - DAY_MS), tzOffsetMs(tz, naiveMs + DAY_MS)]);
  return [...offsets].map(offset => naiveMs - offset).filter(at => at + tzOffsetMs(tz, at) === naiveMs);
}

/**
 * Converts a "naive" ms value (local wall-clock digits stamped as if UTC) in `tz` to the true UTC
 * instant, as geo-chat does: a repeated hour takes its earlier instant, a skipped one reads an hour on.
 */
export function localToUtcMs(naiveMs: number, tz: string): number {
  const instants = localInstants(naiveMs, tz);
  if (instants.length > 0) return Math.min(...instants);
  const later = localInstants(naiveMs + HOUR_MS, tz);
  return later.length > 0 ? Math.min(...later) : naiveMs - tzOffsetMs(tz, naiveMs);
}

/** A wall-clock time the clocks skip in `tz`, such as 02:30 on a spring-forward night. */
export function isSkippedLocalTime(naiveMs: number, tz: string): boolean {
  return localInstants(naiveMs, tz).length === 0;
}

/** Whether `tz` resolves as a real IANA timezone name (vs. e.g. a Windows zone name). */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Short zone abbreviation (e.g. "PDT") for `tz` at the instant `utcMs`. */
export function tzAbbreviation(tz: string, utcMs: number): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(new Date(utcMs))
        .find(part => part.type === 'timeZoneName')?.value ?? tz
    );
  } catch {
    return tz;
  }
}

/** Splits an iCal property key from its optional TZID param, e.g. `DTSTART;TZID=America/Santiago`
 *  -> `{ key: 'DTSTART', tzid: 'America/Santiago' }`. */
function parseKey(rawKey: string): { key: string; tzid?: string } {
  return { key: rawKey.split(';')[0], tzid: rawKey.match(/TZID=([^;]+)/)?.[1] };
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
          if (!isValidByDay(day)) {
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
 *
 * `requireFutureStart` should only be set for brand-new calls — an existing recurring
 * series' DTSTART is its first-ever occurrence and can legitimately be in the past while
 * still producing valid future occurrences, so edits must not fail this check.
 */
export function validateSchedule(
  schedule: string,
  options?: { requireFutureStart?: boolean }
): ScheduleValidationResult {
  const errors: string[] = [];

  if (!schedule.trim()) {
    return { valid: false, errors: ['Schedule cannot be empty'] };
  }

  const lines = schedule.split('\n').filter(l => l.trim());
  const props: Record<string, string> = {};
  const tzids: Record<string, string | undefined> = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      errors.push(`Invalid line: "${line}" (missing ":")`);
      continue;
    }
    // Key may carry iCal params, e.g. `DTSTART;TZID=America/Santiago` — strip
    // them before checking against KNOWN_PROPS, which only tracks bare names.
    const { key, tzid } = parseKey(line.substring(0, colonIdx).trim());
    const value = line.substring(colonIdx + 1).trim();

    if (!KNOWN_PROPS.has(key)) {
      errors.push(`Unknown property "${key}". Supported: ${[...KNOWN_PROPS].join(', ')}`);
      continue;
    }

    if (key in props) {
      errors.push(`Duplicate property "${key}"`);
      continue;
    }

    if (tzid && !isValidTimeZone(tzid)) {
      errors.push(`Invalid timezone "${tzid}" on ${key}`);
      continue;
    }

    props[key] = value;
    tzids[key] = tzid;
  }

  if (!props.DTSTART) {
    errors.push('DTSTART is required');
  } else if (!isValidICalDate(props.DTSTART)) {
    errors.push(`Invalid DTSTART date "${props.DTSTART}". Expected format: YYYYMMDDTHHmmSS (optionally ending with Z)`);
  } else if (skipped(props.DTSTART, tzids.DTSTART)) {
    errors.push(SKIPPED_TIME_ERROR);
  } else if (options?.requireFutureStart && icalInstantMs(props.DTSTART, tzids.DTSTART) <= Date.now()) {
    errors.push('Start time must be in the future');
  }
  if (props.DTEND && isValidICalDate(props.DTEND) && skipped(props.DTEND, tzids.DTEND)) {
    errors.push(SKIPPED_TIME_ERROR);
  }

  if (props.DTEND) {
    if (!isValidICalDate(props.DTEND)) {
      errors.push(`Invalid DTEND date "${props.DTEND}". Expected format: YYYYMMDDTHHmmSS (optionally ending with Z)`);
    } else if (props.DTSTART && isValidICalDate(props.DTSTART)) {
      const start = parseICalDate(props.DTSTART)!;
      const end = parseICalDate(props.DTEND)!;
      if (end <= start) {
        errors.push('DTEND must be after DTSTART');
      } else {
        const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
        if (durationMinutes < MIN_CALL_DURATION_MINUTES) {
          errors.push(`Call must be at least ${MIN_CALL_DURATION_MINUTES} minutes long`);
        } else if (durationMinutes > MAX_CALL_DURATION_MINUTES) {
          const h = Math.floor(MAX_CALL_DURATION_MINUTES / 60);
          const m = MAX_CALL_DURATION_MINUTES % 60;
          errors.push(`Call can't be longer than ${h}h${m ? ` ${m}m` : ''}`);
        }
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
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.substring(0, eqIdx);
    const val = part.substring(eqIdx + 1);
    switch (key) {
      case 'FREQ':
        result.freq = val;
        break;
      case 'BYDAY':
        result.byDay = val ? val.split(',') : [];
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

/** Raw `RRULE:` value from a schedule string (e.g. "FREQ=WEEKLY;BYDAY=TH"), for callers that
 *  need to pass it through verbatim (e.g. Google Calendar's `recur` deep-link param) rather
 *  than the decomposed fields `parseSchedule` returns. */
export function extractRawRRule(schedule: string): string | undefined {
  for (const line of schedule.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    if (line.slice(0, colonIdx).trim() === 'RRULE') return line.slice(colonIdx + 1).trim();
  }
  return undefined;
}

export interface ParsedSchedule {
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24h) — in `timezone` if set, else UTC
  endTime: string; // HH:MM (24h) or '' — in `timezone` if set, else UTC
  freq: string; // DAILY, WEEKLY, MONTHLY, YEARLY, or ''
  byDay: string[]; // e.g. ['MO', 'WE', 'FR']
  interval: number; // 1 = default
  /** IANA zone the schedule was authored in (e.g. "America/Los_Angeles"), or unset for legacy UTC schedules. */
  timezone?: string;
}

/** Parse an iCalendar schedule string into structured fields. */
export function parseSchedule(schedule: string): ParsedSchedule {
  const result: ParsedSchedule = {
    startDate: '',
    startTime: '09:00',
    endTime: '',
    freq: '',
    byDay: [],
    interval: 1,
  };

  if (!schedule) return result;

  const lines = schedule.split('\n');
  const props: Record<string, string> = {};
  const tzids: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    // Key may carry iCal params, e.g. `DTSTART;TZID=America/Santiago`.
    const { key: name, tzid } = parseKey(line.substring(0, colonIdx).trim());
    if (tzid) tzids[name] = tzid;
    props[name] = line.substring(colonIdx + 1).trim();
  }

  // A TZID-qualified value's digits are already the local wall clock in that zone
  // — no conversion needed, just read them back with the UTC-labeled accessors
  // `parseICalDate` produces. A bare/`Z`-suffixed value is genuinely UTC.
  if (tzids.DTSTART) result.timezone = tzids.DTSTART;

  if (props.DTSTART) {
    const d = parseICalDate(props.DTSTART);
    if (d) {
      const y = d.getUTCFullYear().toString().padStart(4, '0');
      const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
      const day = d.getUTCDate().toString().padStart(2, '0');
      result.startDate = `${y}-${m}-${day}`;
      result.startTime = `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
    }
  }

  if (props.DTEND) {
    const d = parseICalDate(props.DTEND);
    if (d) {
      result.endTime = `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
    }
  }

  if (props.RRULE) {
    const rrule = parseRRule(props.RRULE);
    if (rrule.freq) result.freq = rrule.freq;
    if (rrule.byDay) result.byDay = rrule.byDay;
    if (rrule.interval) result.interval = rrule.interval;
  }

  return result;
}

/**
 * Serialize structured schedule fields into an iCalendar string. When `timezone`
 * is set, `startTime`/`endTime` are treated as local wall-clock in that zone and
 * written as `DTSTART;TZID=...`/`DTEND;TZID=...` (no trailing `Z`) — DST-aware on
 * read via `parseSchedule`/`tzOffsetMs`. Omitting `timezone` keeps the legacy
 * UTC-`Z` behavior, unchanged for every existing caller.
 */
export function serializeSchedule(parsed: ParsedSchedule): string {
  if (!parsed.startDate) return '';

  const [year, month, day] = parsed.startDate.split('-');
  const [startH, startM] = parsed.startTime.split(':');
  const tzSuffix = parsed.timezone ? `;TZID=${parsed.timezone}` : '';
  const zSuffix = parsed.timezone ? '' : 'Z';
  const dtstart = `${year}${month}${day}T${startH}${startM}00${zSuffix}`;

  const lines = [`DTSTART${tzSuffix}:${dtstart}`];

  if (parsed.endTime) {
    const [endH, endM] = parsed.endTime.split(':');
    const dtend = `${year}${month}${day}T${endH}${endM}00${zSuffix}`;
    lines.push(`DTEND${tzSuffix}:${dtend}`);
  }

  if (parsed.freq) {
    const rruleParts = [`FREQ=${parsed.freq}`];
    if (parsed.interval > 1) {
      rruleParts.push(`INTERVAL=${parsed.interval}`);
    }
    if (parsed.byDay.length > 0) {
      rruleParts.push(`BYDAY=${parsed.byDay.join(',')}`);
    }
    lines.push(`RRULE:${rruleParts.join(';')}`);
  }

  return lines.join('\n');
}

export function formatSchedule(schedule: string): string {
  const lines = schedule.split('\n');
  const props: Record<string, string> = {};
  let tzid: string | undefined;

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const { key, tzid: keyTzid } = parseKey(line.substring(0, colonIdx).trim());
    const value = line.substring(colonIdx + 1).trim();
    if (key === 'DTSTART') tzid = keyTzid;
    props[key] = value;
  }

  const parts: string[] = [];

  // Recurrence
  if (props.RRULE) {
    const rrule = parseRRule(props.RRULE);
    const freqLabel = rrule.freq ? (FREQ_LABELS[rrule.freq] ?? rrule.freq) : '';

    if (rrule.byDay && rrule.byDay.length > 0) {
      const dayNames = rrule.byDay.map(byDayLabel);
      const unit = rrule.freq === 'MONTHLY' ? 'months' : 'weeks';
      const interval = rrule.interval && rrule.interval > 1 ? `Every ${rrule.interval} ${unit}` : freqLabel;
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

  // Time range. Note: when `tzid` is set, DTSTART/DTEND's digits are already the
  // local wall clock in that zone (per the format's write side, `serializeSchedule`),
  // so `parseICalDate`'s UTC-labeled accessors already read back the right numbers —
  // only the trailing zone label needs to reflect the real zone instead of "UTC".
  const startDate = props.DTSTART ? parseICalDate(props.DTSTART) : null;
  const endDate = props.DTEND ? parseICalDate(props.DTEND) : null;

  const zoneLabel = tzid && startDate ? tzAbbreviation(tzid, localToUtcMs(startDate.getTime(), tzid)) : 'UTC';

  if (startDate && endDate) {
    parts.push(`${formatTime(startDate)} – ${formatTime(endDate)} ${zoneLabel}`);
  } else if (startDate) {
    parts.push(`${formatTime(startDate)} ${zoneLabel}`);
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
