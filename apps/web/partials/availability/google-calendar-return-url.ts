import { type ReadableParams, urlWithoutModal } from '~/core/deep-links/modal-deep-link';

const CALENDAR_PARAM = 'calendar';
const REASON_PARAM = 'reason';

export type CalendarReturn = { outcome: 'connected' | 'error'; reason: string | null };

/** geo-chat's redirect back from Google: `?calendar=connected` or `?calendar=error&reason=…`. */
export function calendarReturn(params: ReadableParams): CalendarReturn | null {
  const outcome = params?.get(CALENDAR_PARAM);
  if (outcome !== 'connected' && outcome !== 'error') return null;
  return { outcome, reason: params?.get(REASON_PARAM) || null };
}

/**
 * The same URL without `calendar` and `reason`, keeping every other param and the fragment.
 * `dropModal` also strips the deep-link trigger, for a return that reopens the editor.
 */
export function urlWithoutCalendarReturn(pathname: string, params: ReadableParams, hash = '', dropModal = false) {
  const next = new URLSearchParams(params?.toString() ?? '');
  next.delete(CALENDAR_PARAM);
  next.delete(REASON_PARAM);
  if (dropModal) return urlWithoutModal(pathname, next, hash);
  const search = next.toString();
  const fragment = !hash || hash === '#' ? '' : hash.startsWith('#') ? hash : `#${hash}`;
  return `${pathname}${search ? `?${search}` : ''}${fragment}`;
}
