'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import { urlWithoutModal } from '~/core/deep-links/modal-deep-link';

import type { CalendarPicks } from './calendar-narrowing';
import { calendarHref } from './debate-calendar-route';

/**
 * A link to the calendar that brings the viewer back to this page, narrowed to `picks`.
 *
 * "Back to Debates" there returns to `from`, so `from` is this page as it is now minus the panel's
 * own trigger, which Back puts back itself. The fragment is read from the location: neither router
 * hook carries it.
 */
export function useCalendarHref(picks?: CalendarPicks) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = pathname
    ? urlWithoutModal(pathname, searchParams, typeof window === 'undefined' ? '' : window.location.hash)
    : null;
  return calendarHref(from, picks);
}
