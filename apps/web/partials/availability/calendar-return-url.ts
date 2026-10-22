import { toOwnSchedule } from '~/core/availability/own-schedule-deep-link';
import type { CalendarProvider } from '~/core/debates/api';
import { type ReadableParams, urlWithoutModal, urlWithoutParams } from '~/core/deep-links/modal-deep-link';

const CALENDAR_PARAM = 'calendar';
const REASON_PARAM = 'reason';
/** Added by the web to `return_to`; geo-chat keeps it on the redirect. Absent means Google. */
const PROVIDER_PARAM = 'calendar_provider';

export type CalendarReturn = { provider: CalendarProvider; outcome: 'connected' | 'error'; reason: string | null };

/** Where geo-chat sends the browser after the provider: this page, with the editor's trigger. */
export function calendarReturnTo(provider: CalendarProvider, href: string) {
  const url = new URL(toOwnSchedule(href));
  if (provider === 'google') url.searchParams.delete(PROVIDER_PARAM);
  else url.searchParams.set(PROVIDER_PARAM, provider);
  return url.toString();
}

/** geo-chat's redirect back from the provider: `?calendar=connected` or `?calendar=error&reason=…`. */
export function calendarReturn(params: ReadableParams): CalendarReturn | null {
  const outcome = params?.get(CALENDAR_PARAM);
  if (outcome !== 'connected' && outcome !== 'error') return null;
  const provider = params?.get(PROVIDER_PARAM) === 'microsoft' ? 'microsoft' : 'google';
  return { provider, outcome, reason: params?.get(REASON_PARAM) || null };
}

/**
 * The same URL without `calendar`, `reason` and `calendar_provider`, keeping every other param and
 * the fragment. `dropModal` also strips the deep-link trigger, for a return that reopens the editor.
 */
export function urlWithoutCalendarReturn(pathname: string, params: ReadableParams, hash = '', dropModal = false) {
  const next = new URLSearchParams(params?.toString() ?? '');
  next.delete(CALENDAR_PARAM);
  next.delete(REASON_PARAM);
  next.delete(PROVIDER_PARAM);
  return dropModal ? urlWithoutModal(pathname, next, hash) : urlWithoutParams(pathname, next, [], hash);
}
