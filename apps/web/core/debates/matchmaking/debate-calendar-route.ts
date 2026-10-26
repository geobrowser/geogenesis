import { normId } from '~/core/utils/norm-id';

import { type CalendarPicks, claimPickKey, splitClaimPickKey } from './calendar-narrowing';
import { isPersonId } from './person-records-document';

/**
 * An id from the URL that is worth keeping: a UUID, hyphenated or bare. Everything downstream hands
 * these to the graph as `UUID!`, where one malformed value fails a whole batch — every claim's name
 * with it — so a hand-edited or truncated link drops the bad value here instead. `isPersonId` is
 * that shape check; nothing about it is specific to people.
 */
function canonicalId(id: string): string | null {
  return isPersonId(id) ? normId(id) : null;
}

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

/**
 * A comma-separated list, each entry in its canonical spelling, then deduplicated: in that order,
 * so one id written hyphenated and bare is one pick, not two.
 */
function idList(raw: string | null, canonical: (id: string) => string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw.split(',').flatMap(id => {
        const value = id.trim() ? canonical(id.trim()) : null;
        return value ? [value] : [];
      })
    ),
  ];
}

/** Picks from the URL. Hyphenated or not, ids come back in the one spelling the panel keys on. */
export function readCalendarPicks(params: Pick<URLSearchParams, 'get'> | null | undefined): CalendarPicks {
  if (!params) return { people: [], claims: [], matchesOnly: false };
  return {
    people: idList(params.get(CALENDAR_PEOPLE_PARAM), canonicalId),
    claims: idList(params.get(CALENDAR_CLAIMS_PARAM), key => {
      const ids = splitClaimPickKey(key);
      return ids && canonicalId(ids.spaceId) && canonicalId(ids.claimId)
        ? claimPickKey(ids.spaceId, ids.claimId)
        : null;
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
