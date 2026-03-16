/**
 * Utilities for parsing iCalendar/RRULE schedule strings into human-readable text.
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

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
};

function parseICalDate(value: string): Date | null {
  // Parses "20260305T170000Z" or "20260305T170000"
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
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
      const unit = rrule.freq === 'DAILY' ? 'days' : rrule.freq === 'WEEKLY' ? 'weeks' : rrule.freq === 'MONTHLY' ? 'months' : 'years';
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
