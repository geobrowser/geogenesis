/** `Today at 1:00 PM`, `Tomorrow at ...`, else `Thu, Sep 24 at ...`. */
export function formatDebateTime(iso: string, now = new Date()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;

  return `${formatDay(at, now)} at ${formatTime(iso)}`;
}

function formatDay(at: Date, now: Date) {
  const days = Math.round((startOfDay(at).getTime() - startOfDay(now).getTime()) / 86_400_000);
  return days === 0
    ? 'Today'
    : days === 1
      ? 'Tomorrow'
      : at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** `Tomorrow, 11:00 – 11:30 AM`: the day once, then the slot. Falls back to the start alone. */
export function formatDebateSlot(startIso: string, endIso: string, now = new Date()) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return formatDebateTime(startIso, now);
  }
  return `${formatDay(start, now)}, ${formatTimeRange(startIso, endIso)}`;
}

/**
 * `11:00 – 11:30 AM` rather than `11:00 AM – 11:30 AM` when both ends share the period. For a row
 * already under its day, such as the Requests timeline's (GEO-3463).
 */
export function formatTimeRange(startIso: string, endIso: string) {
  const from = formatTime(startIso);
  const to = formatTime(endIso);
  const period = /\s?([AP]M)$/i;
  const fromPeriod = from.match(period)?.[1];
  const shared = fromPeriod !== undefined && fromPeriod === to.match(period)?.[1];
  return `${shared ? from.replace(period, '') : from} – ${to}`;
}

/** Local midnight on the day of `at`: what a list grouped by day keys its days on. */
export function startOfDay(at: Date) {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

export function formatTime(iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
