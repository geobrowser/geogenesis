/** Display helpers for call occurrences. Times render in the viewer's locale. */
import { parseSchedule, tzAbbreviation, tzOffsetMs } from '~/core/utils/schedule';

function time(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(' ', '')
    .toLowerCase();
}

/** "5:00pm - 7:00pm" */
export function formatTimeRange(startMs: number, endMs: number): string {
  return `${time(startMs)} - ${time(endMs)}`;
}

/** "Wed, July 1" */
export function formatDateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
}

/** "June 24, 2025" */
export function formatFullDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Jul 8, 2:34pm" — attendee/call-log timeline entries. */
export function formatDateTime(ms: number): string {
  const date = new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date}, ${time(ms)}`;
}

/** "32:10" or "1:02:10" for recordings an hour or longer. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "just now" / "5m" / "2h" / "3d" — compact relative time for chat timestamps. */
export function formatRelativeTime(ms: number, now = Date.now()): string {
  const deltaSec = Math.max(0, Math.floor((now - ms) / 1000));
  if (deltaSec < 30) return 'just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h`;
  return `${Math.floor(deltaSec / 86400)}d`;
}

function icsDate(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** RFC 5545 text escaping for `;`, `,`, `\`, and newlines in SUMMARY/DESCRIPTION values. */
function escapeICSText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** RFC 5545 line folding: no line may exceed 75 octets; continuations start with a single space. */
function foldICSLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  // Split into code points, not UTF-16 code units, so a surrogate pair (e.g. an
  // emoji) is never treated as two separate characters and folded mid-pair.
  const chars = Array.from(line);
  const segments: string[] = [];
  let start = 0;
  let budget = 75;
  while (start < chars.length) {
    let end = start;
    let len = 0;
    while (end < chars.length) {
      const charLen = encoder.encode(chars[end]).length;
      if (len + charLen > budget) break;
      len += charLen;
      end++;
    }
    end = Math.max(end, start + 1);
    segments.push(chars.slice(start, end).join(''));
    start = end;
    budget = 74; // continuation lines reserve 1 octet for the mandatory leading space
  }
  return segments.map((seg, i) => (i === 0 ? seg : ` ${seg}`)).join('\r\n');
}

function formatUtcOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+';
  const abs = Math.abs(offsetMs);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  return `${sign}${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
}

/** Every UTC-offset change of `tz` within `year`, pinpointed to the second via binary search. */
function findDstTransitions(
  tz: string,
  year: number
): Array<{ epochMs: number; offsetBeforeMs: number; offsetAfterMs: number }> {
  // Sample at noon UTC on the 1st of each month (plus next January) — well clear of
  // any transition instant itself, which always falls in the small hours locally.
  const samples = Array.from({ length: 13 }, (_, month) => {
    const ms = Date.UTC(year + Math.floor(month / 12), month % 12, 1, 12, 0);
    return { ms, offset: tzOffsetMs(tz, ms) };
  });

  const transitions: Array<{ epochMs: number; offsetBeforeMs: number; offsetAfterMs: number }> = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (curr.offset === prev.offset) continue;

    let lo = prev.ms;
    let hi = curr.ms;
    while (hi - lo > 1000) {
      const mid = Math.floor((lo + hi) / 2);
      if (tzOffsetMs(tz, mid) === prev.offset) lo = mid;
      else hi = mid;
    }
    transitions.push({ epochMs: hi, offsetBeforeMs: prev.offset, offsetAfterMs: curr.offset });
  }
  return transitions;
}

/**
 * RFC 5545 `VTIMEZONE` block for `tz`, scoped to `year`'s DST transitions (mirrors
 * curator's `generate-ics.ts`, built on `Date`/`Intl` instead of `Temporal` — no new
 * dependency). Callers only need this for the specific year(s) an event occurs in,
 * not a perpetual/all-years definition.
 */
function generateVTimezone(tz: string, year: number): string[] {
  const transitions = findDstTransitions(tz, year);
  const lines = ['BEGIN:VTIMEZONE', `TZID:${tz}`];

  if (transitions.length === 0) {
    const offset = tzOffsetMs(tz, Date.UTC(year, 0, 1, 12, 0));
    lines.push(
      'BEGIN:STANDARD',
      `DTSTART:${year}0101T000000`,
      `TZOFFSETFROM:${formatUtcOffset(offset)}`,
      `TZOFFSETTO:${formatUtcOffset(offset)}`,
      `TZNAME:${tzAbbreviation(tz, Date.UTC(year, 0, 1, 12, 0))}`,
      'END:STANDARD'
    );
  } else {
    for (const t of transitions) {
      const type = t.offsetAfterMs > t.offsetBeforeMs ? 'DAYLIGHT' : 'STANDARD';
      // RFC 5545: a VTIMEZONE sub-component's DTSTART is the local wall clock at the
      // transition expressed in the *pre*-transition offset (the last moment before
      // the clocks jump).
      const localWallMs = t.epochMs + t.offsetBeforeMs;
      lines.push(
        `BEGIN:${type}`,
        `DTSTART:${new Date(localWallMs)
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}Z$/, '')}`,
        `TZOFFSETFROM:${formatUtcOffset(t.offsetBeforeMs)}`,
        `TZOFFSETTO:${formatUtcOffset(t.offsetAfterMs)}`,
        `TZNAME:${tzAbbreviation(tz, t.epochMs)}`,
        `END:${type}`
      );
    }
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

/**
 * Curator never puts the real call description in a calendar export — every export
 * (Google, Outlook, the recurring ICS feed) instead gets a join link plus this
 * recording-consent notice (`community-call.tsx`'s `calendarDescription` /
 * curator-backend's ICS handler, both pass this literal string). Kept verbatim.
 */
export const RECORDING_NOTICE =
  'NOTE: Please note that this meeting will be recorded, including audio, video, and text chat. The recording will be posted publicly online on Geo / YouTube / X. By attending this meeting, you consent to being recorded and to the subsequent publication of the recording. If you do not wish to be recorded, please keep your camera and microphone off or choose not to attend.';

/** Absolute URL to this call series' landing page — embedded in calendar exports as
 *  both the join link and the ICS `URL`/`LOCATION` fields. */
export function buildCallJoinUrl(args: { origin: string; spaceId: string; callId: string }): string {
  return `${args.origin}/space/${args.spaceId}/community/call/${args.callId}`;
}

function buildCalendarDescription(joinUrl: string | undefined): string {
  return joinUrl ? `Join the call: ${joinUrl}\n\n${RECORDING_NOTICE}` : RECORDING_NOTICE;
}

/** Google Calendar "quick add" deep link for a single occurrence. `rrule`, if given
 *  (the series' raw `RRULE:` value, see `extractRawRRule`), adds the recurrence so the
 *  created event repeats instead of covering just this one occurrence. `timezone`, if
 *  given, sets `ctz` so Google Calendar interprets `dates` in that zone instead of UTC. */
export function buildGoogleCalendarHref(args: {
  name: string;
  startMs: number;
  endMs: number;
  joinUrl?: string;
  rrule?: string;
  timezone?: string;
}): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: args.name,
    dates: `${icsDate(args.startMs)}/${icsDate(args.endMs)}`,
    details: buildCalendarDescription(args.joinUrl),
    ...(args.joinUrl ? { location: args.joinUrl } : {}),
    ...(args.rrule ? { recur: `RRULE:${args.rrule}` } : {}),
    ...(args.timezone ? { ctz: args.timezone } : {}),
  });
  return `https://calendar.google.com/calendar/u/0/r/eventedit?${params.toString()}`;
}

/** Outlook web calendar "compose event" deep link for a single occurrence. No RRULE
 *  support — Outlook deep links can't express recurrence, same limitation curator has. */
export function buildOutlookCalendarHref(args: {
  name: string;
  startMs: number;
  endMs: number;
  joinUrl?: string;
}): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: args.name,
    startdt: new Date(args.startMs).toISOString(),
    enddt: new Date(args.endMs).toISOString(),
    body: buildCalendarDescription(args.joinUrl),
    ...(args.joinUrl ? { location: args.joinUrl } : {}),
  });
  return `https://outlook.office.com/calendar/deeplink/compose?${params.toString()}`;
}

/**
 * `webcal://` subscription link to this series' own recurring feed (see
 * `app/api/community-call/ics/[spaceId]/[callId]/route.ts`) — unlike the other
 * builders here this stays live as the series changes, since the calendar app
 * re-fetches it rather than importing a one-shot snapshot. `origin` must be the
 * caller's `window.location.origin` (or request origin server-side) since a
 * subscription link needs an absolute, network-fetchable URL.
 */
export function buildWebcalHref(args: { origin: string; spaceId: string; callId: string }): string {
  const url = new URL(`/api/community-call/ics/${args.spaceId}/${args.callId}`, args.origin);
  return `webcal://${url.host}${url.pathname}`;
}

/**
 * Full VCALENDAR body for a series' own recurring feed (served by
 * `app/api/community-call/ics/[spaceId]/[callId]/route.ts`, linked via `buildWebcalHref`).
 * `schedule` is already valid iCalendar lines (DTSTART/DTEND/RRULE, see
 * `core/utils/schedule.ts`'s `serializeSchedule`) — embed them verbatim rather than
 * re-deriving a single occurrence, so a subscribed calendar keeps showing future
 * occurrences as the RRULE produces them.
 */
export function buildSeriesIcsBody(args: { callId: string; name: string; schedule: string; joinUrl?: string }): string {
  const scheduleLines = args.schedule
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const parsed = parseSchedule(args.schedule);
  const vtimezone =
    parsed.timezone && parsed.startDate ? generateVTimezone(parsed.timezone, Number(parsed.startDate.slice(0, 4))) : [];

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Geo//Community Calls//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...vtimezone,
    'BEGIN:VEVENT',
    `UID:${args.callId}@geobrowser.io`,
    `DTSTAMP:${icsDate(Date.now())}`,
    ...scheduleLines,
    `SUMMARY:${escapeICSText(args.name)}`,
    ...(args.joinUrl ? [`URL:${args.joinUrl}`, `LOCATION:${args.joinUrl}`] : []),
    `DESCRIPTION:${escapeICSText(buildCalendarDescription(args.joinUrl))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldICSLine).join('\r\n');
}
