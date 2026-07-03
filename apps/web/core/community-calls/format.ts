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
