'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import type { ReadableParams } from '~/core/deep-links/modal-deep-link';
import { useDeepLinkEffect } from '~/core/deep-links/use-deep-link';
import { useSetToast } from '~/core/hooks/use-toast';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { calendarReturnCopy } from './google-calendar-copy';

const CALENDAR_PARAM = 'calendar';
const REASON_PARAM = 'reason';

/** geo-chat's redirect back from Google: `?calendar=connected` or `?calendar=error&reason=…`. */
export function calendarReturn(params: ReadableParams) {
  const outcome = params?.get(CALENDAR_PARAM);
  if (outcome !== 'connected' && outcome !== 'error') return null;
  return { outcome, reason: params?.get(REASON_PARAM) || null } as const;
}

/** The same URL without `calendar` and `reason`, keeping every other param and the fragment. */
export function urlWithoutCalendarReturn(pathname: string, params: ReadableParams, hash = '') {
  const next = new URLSearchParams(params?.toString() ?? '');
  next.delete(CALENDAR_PARAM);
  next.delete(REASON_PARAM);
  const search = next.toString();
  const fragment = !hash || hash === '#' ? '' : hash.startsWith('#') ? hash : `#${hash}`;
  return `${pathname}${search ? `?${search}` : ''}${fragment}`;
}

/** Toasts the outcome of connecting Google Calendar on the way back from Google, then clears it from the URL. */
export function useGoogleCalendarReturn() {
  const enabled = useFeatureFlag('googleCalendar');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setToast = useSetToast();
  const result = calendarReturn(searchParams);
  const hash = typeof window === 'undefined' ? '' : window.location.hash;

  useDeepLinkEffect({
    requested: result !== null,
    cleanUrl: urlWithoutCalendarReturn(pathname ?? '/', searchParams, hash),
    enabled,
    run: () => {
      if (result) setToast(<span>{calendarReturnCopy(result.outcome, result.reason)}</span>);
    },
  });
}
