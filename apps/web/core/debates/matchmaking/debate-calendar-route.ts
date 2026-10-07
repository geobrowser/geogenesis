import { type CalendarPicks, splitClaimPickKey } from './calendar-narrowing';

/** Where the calendar was opened from, read for `debate_calendar_opened`'s `opened_from`. */
export const CALENDAR_FROM_PARAM = 'from';
export const CALENDAR_PATH = '/matchmaking/calendar';
/** `?view=debates` opens the admin view of everyone's scheduled debates (GEO-2943); admins only. */
export const CALENDAR_VIEW_PARAM = 'view';

/**
 * The People and Claims panel's picks (GEO-3220), so a narrowed week survives a reload and can be
 * shared. `people` holds profile space ids, `claims` holds `space:claim` pairs, and `matches=1` is
 * Matches only. Comma-separated, as the Claims tab's own params are.
 */
export const CALENDAR_PEOPLE_PARAM = 'people';
export const CALENDAR_CLAIMS_PARAM = 'claims';
export const CALENDAR_MATCHES_PARAM = 'matches';

/** The calendar's link, from the hub on `from`: the page's whole URL, query and fragment included. */
export function calendarHref(from: string | null, picks?: CalendarPicks): string {
  const params = new URLSearchParams();
  if (from && from.split(/[?#]/, 1)[0] !== CALENDAR_PATH) params.set(CALENDAR_FROM_PARAM, from);
  if (picks) writeCalendarPicks(params, picks);
  const query = params.toString();
  return query ? `${CALENDAR_PATH}?${query}` : CALENDAR_PATH;
}

function idList(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map(id => id.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

/** Picks from the URL. Hyphenated or not, ids come back in the one spelling the panel keys on. */
export function readCalendarPicks(params: Pick<URLSearchParams, 'get'> | null | undefined): CalendarPicks {
  if (!params) return { people: [], claims: [], matchesOnly: false };
  const hex = (id: string) => id.replace(/-/g, '');
  return {
    people: idList(params.get(CALENDAR_PEOPLE_PARAM)).map(hex),
    claims: idList(params.get(CALENDAR_CLAIMS_PARAM)).flatMap(key => {
      const ids = splitClaimPickKey(key);
      return ids ? [`${hex(ids.spaceId)}:${hex(ids.claimId)}`] : [];
    }),
    matchesOnly: params.get(CALENDAR_MATCHES_PARAM) === '1',
  };
}

/** Writes picks into `params`, dropping each one that is empty so an unnarrowed week has a bare URL. */
export function writeCalendarPicks(params: URLSearchParams, picks: CalendarPicks): URLSearchParams {
  const set = (name: string, values: readonly string[]) => {
    if (values.length > 0) params.set(name, values.join(','));
    else params.delete(name);
  };
  set(CALENDAR_PEOPLE_PARAM, picks.people);
  set(CALENDAR_CLAIMS_PARAM, picks.claims);
  if (picks.matchesOnly) params.set(CALENDAR_MATCHES_PARAM, '1');
  else params.delete(CALENDAR_MATCHES_PARAM);
  return params;
}
