/** Display helpers for call occurrences. Times render in the viewer's locale. */

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

/** Build a minimal single-occurrence VEVENT and return a downloadable blob URL. */
export function buildIcsHref(args: {
  callId: string;
  name: string;
  description: string | null;
  startMs: number;
  endMs: number;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Geo//Community Calls//EN',
    'BEGIN:VEVENT',
    `UID:${args.callId}-${args.startMs}@geobrowser.io`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(args.startMs)}`,
    `DTEND:${icsDate(args.endMs)}`,
    `SUMMARY:${args.name}`,
    ...(args.description ? [`DESCRIPTION:${args.description.replace(/\n/g, '\\n')}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

/** Google Calendar "quick add" deep link for a single occurrence. `rrule`, if given
 *  (the series' raw `RRULE:` value, see `extractRawRRule`), adds the recurrence so the
 *  created event repeats instead of covering just this one occurrence. */
export function buildGoogleCalendarHref(args: {
  name: string;
  description: string | null;
  startMs: number;
  endMs: number;
  rrule?: string;
}): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: args.name,
    dates: `${icsDate(args.startMs)}/${icsDate(args.endMs)}`,
    ...(args.description ? { details: args.description } : {}),
    ...(args.rrule ? { recur: `RRULE:${args.rrule}` } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook web calendar "compose event" deep link for a single occurrence. */
export function buildOutlookCalendarHref(args: {
  name: string;
  description: string | null;
  startMs: number;
  endMs: number;
}): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: args.name,
    startdt: new Date(args.startMs).toISOString(),
    enddt: new Date(args.endMs).toISOString(),
    ...(args.description ? { body: args.description } : {}),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
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
export function buildSeriesIcsBody(args: {
  callId: string;
  name: string;
  description: string | null;
  schedule: string;
}): string {
  const scheduleLines = args.schedule
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Geo//Community Calls//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${args.callId}@geobrowser.io`,
    `DTSTAMP:${icsDate(Date.now())}`,
    ...scheduleLines,
    `SUMMARY:${args.name}`,
    ...(args.description ? [`DESCRIPTION:${args.description.replace(/\n/g, '\\n')}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
