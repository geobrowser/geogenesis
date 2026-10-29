import { type ParsedSchedule, parseSchedule, serializeSchedule } from '~/core/utils/schedule';

/** What the call form edits: a date and times in the schedule's zone, and a repeat choice. */
export type ScheduleFields = { startDate: string; startTime: string; endTime: string; repeat: string };

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const ORDINAL_BYDAY = /^([+-]?\d{1,2})([A-Z]{2})$/;

/** Repeat-select value ('none'/'DAILY'/'WEEKLY'/'BIWEEKLY'/'MONTHLY') for a parsed freq+interval. */
export function repeatFromSchedule(freq: string, interval: number): string {
  if (!freq) return 'none';
  if (freq === 'WEEKLY' && interval === 2) return 'BIWEEKLY';
  return freq;
}

export function ruleFromRepeat(repeat: string): { freq: string; interval: number } {
  if (repeat === 'none') return { freq: '', interval: 1 };
  if (repeat === 'BIWEEKLY') return { freq: 'WEEKLY', interval: 2 };
  return { freq: repeat, interval: 1 };
}

/** Line order kept; RRULE parts sorted and a default `INTERVAL=1` dropped, which mean the same. */
function normalize(schedule: string) {
  return schedule
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      if (!line.startsWith('RRULE:')) return line;
      const parts = line
        .slice('RRULE:'.length)
        .split(';')
        .filter(part => part && part !== 'INTERVAL=1');
      return `RRULE:${parts.sort().join(';')}`;
    })
    .join('\n');
}

function representable(parsed: ParsedSchedule) {
  const repeat = repeatFromSchedule(parsed.freq, parsed.interval);
  if (!['none', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(repeat)) return false;
  return ruleFromRepeat(repeat).interval === parsed.interval;
}

/**
 * A stored schedule as the form's fields, in its own zone (`timezone` unset for a legacy UTC one).
 * `null` when the fields cannot hold it unchanged, so the form must not rewrite it.
 */
export function storedScheduleFields(
  schedule: string
): { fields: ScheduleFields; byDay: string[]; timezone: string | undefined } | null {
  if (!schedule.trim()) return null;
  const parsed = parseSchedule(schedule);
  if (!parsed.startDate || !representable(parsed)) return null;
  if (normalize(serializeSchedule(parsed)) !== normalize(schedule)) return null;
  return {
    fields: {
      startDate: parsed.startDate,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      repeat: repeatFromSchedule(parsed.freq, parsed.interval),
    },
    byDay: parsed.byDay,
    timezone: parsed.timezone,
  };
}

function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The same weekday rule for a moved start: Tuesday becomes Wednesday, the third Monday the Nth new weekday. */
function movedByDay(byDay: string[], from: string, to: string): string[] {
  if (byDay.length !== 1) return byDay;
  const [token] = byDay;
  const before = weekdayOf(from);
  const after = weekdayOf(to);
  if (token === before) return [after];
  const match = ORDINAL_BYDAY.exec(token);
  if (!match || match[2] !== before) return byDay;
  const [y, m, d] = to.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = Number(match[1]) < 0 && d + 7 > daysInMonth;
  return [`${last ? -1 : Math.ceil(d / 7)}${after}`];
}

/**
 * The schedule an edit saves. Untouched fields keep the stored string as is; changed ones keep its
 * zone, and its BYDAY while the repeat is unchanged. A schedule the fields cannot hold is kept.
 */
export function editedSchedule(stored: string, fields: ScheduleFields): string {
  const current = storedScheduleFields(stored);
  if (!current) return stored;
  const { fields: before } = current;
  const same =
    before.startDate === fields.startDate &&
    before.startTime === fields.startTime &&
    before.endTime === fields.endTime &&
    before.repeat === fields.repeat;
  if (same) return stored;

  const byDay =
    fields.repeat !== before.repeat
      ? []
      : fields.startDate !== before.startDate
        ? movedByDay(current.byDay, before.startDate, fields.startDate)
        : current.byDay;
  return serializeSchedule({ ...fields, ...ruleFromRepeat(fields.repeat), byDay, timezone: current.timezone });
}
