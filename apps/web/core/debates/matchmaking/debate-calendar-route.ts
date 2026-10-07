/** Where the calendar was opened from, read for `debate_calendar_opened`'s `opened_from`. */
export const CALENDAR_FROM_PARAM = 'from';
export const CALENDAR_PATH = '/matchmaking/calendar';
/** `?view=debates` opens the admin view of everyone's scheduled debates (GEO-2943); admins only. */
export const CALENDAR_VIEW_PARAM = 'view';

/** The calendar's link, from the hub on `from`: the page's whole URL, query and fragment included. */
export function calendarHref(from: string | null): string {
  if (!from || from.split(/[?#]/, 1)[0] === CALENDAR_PATH) return CALENDAR_PATH;
  return `${CALENDAR_PATH}?${new URLSearchParams({ [CALENDAR_FROM_PARAM]: from }).toString()}`;
}
