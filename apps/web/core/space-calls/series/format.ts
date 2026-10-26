/** "Mon, Nov 2", in `timeZone` (the viewer's when omitted). */
export function callDateLabel(iso: string, timeZone?: string): string | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
}

/** "9:00 AM – 10:00 AM PST", or "9:00 AM PST" with no end, in `timeZone` (the viewer's when omitted). */
export function callTimeLabel(startsAt: string, endsAt: string | null, timeZone?: string): string | null {
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return null;
  const end = endsAt ? Date.parse(endsAt) : Number.NaN;
  const time = (ms: number, zone: boolean) =>
    new Date(ms).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      ...(zone ? { timeZoneName: 'short' } : {}),
    });
  return Number.isNaN(end) ? time(start, true) : `${time(start, false)} – ${time(end, true)}`;
}

/** "Mon, Nov 2 · 9:00 AM – 10:00 AM PST". */
export function callWhenLabel(startsAt: string, endsAt: string | null, timeZone?: string): string | null {
  const date = callDateLabel(startsAt, timeZone);
  const time = callTimeLabel(startsAt, endsAt, timeZone);
  return date && time ? `${date} · ${time}` : null;
}

/** "1h 31m", "45m", or "<1m"; `null` for no length. */
export function callDurationLabel(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
