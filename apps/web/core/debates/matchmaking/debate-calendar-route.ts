/** Where the calendar came from, so "Back to Debates" can put the viewer back there with the hub open. */
export const CALENDAR_FROM_PARAM = 'from';
export const CALENDAR_PATH = '/matchmaking/calendar';

/**
 * The calendar's link, from the hub on `from`: the page's whole URL, its own query and fragment
 * included, so Back to Debates returns to that page as it was rather than to its bare path.
 */
export function calendarHref(from: string | null): string {
  if (!from || from.split(/[?#]/, 1)[0] === CALENDAR_PATH) return CALENDAR_PATH;
  return `${CALENDAR_PATH}?${new URLSearchParams({ [CALENDAR_FROM_PARAM]: from }).toString()}`;
}
