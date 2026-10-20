'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { OWN_SCHEDULE_MODAL } from '~/core/availability/own-schedule-deep-link';
import { requestsModal } from '~/core/deep-links/modal-deep-link';
import { useDeepLinkEffect } from '~/core/deep-links/use-deep-link';
import { useSetToast } from '~/core/hooks/use-toast';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { calendarReturnCopy } from './google-calendar-copy';
import { type CalendarReturn, calendarReturn, urlWithoutCalendarReturn } from './google-calendar-return-url';
import { OwnScheduleModal } from './own-schedule-modal';

/**
 * The way back from Google: `?calendar=…` plus the editor's `?modal=schedule`, both cleared in one
 * write. A signed-in viewer gets the editor reopened with the outcome in it; anyone else a toast,
 * since the toast sits under the editor's backdrop.
 */
export function GoogleCalendarReturn() {
  const enabled = useFeatureFlag('googleCalendar');
  const { ready, authenticated } = usePrivy();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setToast = useSetToast();
  const result = calendarReturn(searchParams);
  const scheduleRequested = requestsModal(searchParams, OWN_SCHEDULE_MODAL);
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const [opened, setOpened] = React.useState<{ returned: CalendarReturn | null } | null>(null);

  useDeepLinkEffect({
    requested: result !== null || scheduleRequested,
    cleanUrl: urlWithoutCalendarReturn(pathname ?? '/', searchParams, hash, scheduleRequested),
    // Held until Privy settles whether there is an editor to open.
    enabled: enabled && ready,
    run: () => {
      if (scheduleRequested && authenticated) setOpened({ returned: result });
      else if (result) setToast(<span>{calendarReturnCopy(result.outcome, result.reason)}</span>);
    },
  });

  if (!opened) return null;

  return (
    <OwnScheduleModal
      open
      onOpenChange={next => !next && setOpened(null)}
      surface="google_calendar"
      calendarReturn={opened.returned}
    />
  );
}
