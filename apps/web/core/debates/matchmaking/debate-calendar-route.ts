/** Where the calendar came from, so "Back to Debates" can put the viewer back there with the hub open. */
export const CALENDAR_FROM_PARAM = 'from';
export const CALENDAR_PATH = '/matchmaking/calendar';

/** The calendar's link, from the hub on `pathname`. */
export function calendarHref(pathname: string | null): string {
  if (!pathname || pathname === CALENDAR_PATH) return CALENDAR_PATH;
  return `${CALENDAR_PATH}?${new URLSearchParams({ [CALENDAR_FROM_PARAM]: pathname }).toString()}`;
}
