'use client';

import * as React from 'react';

import { usePathname, useSearchParams } from 'next/navigation';

import { calendarConnectCallbackFailed, calendarConnected } from '~/core/availability/calendar-analytics';
import { OWN_SCHEDULE_MODAL } from '~/core/availability/own-schedule-deep-link';
import { requestsModal } from '~/core/deep-links/modal-deep-link';
import { useDeepLinkEffect } from '~/core/deep-links/use-deep-link';
import { useSetToast } from '~/core/hooks/use-toast';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { calendarReturnCopy } from './calendar-copy';
import { type CalendarReturn, calendarReturn, urlWithoutCalendarReturn } from './calendar-return-url';
import { OwnScheduleModal } from './own-schedule-modal';

/**
 * Handles `?calendar=…` and `?modal=schedule` from a calendar provider's redirect (Google or
 * Outlook), cleared in one write. Signed in, it reopens the editor with the outcome inside (a toast
 * would sit under its backdrop); else a toast.
 */
export function GoogleCalendarReturn() {
  const googleEnabled = useFeatureFlag('googleCalendar');
  const microsoftEnabled = useFeatureFlag('microsoftCalendar');
  const enabled = googleEnabled || microsoftEnabled;
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
      if (result?.outcome === 'connected') calendarConnected(result.provider);
      else if (result) calendarConnectCallbackFailed(result.provider, result.reason);
      if (scheduleRequested && authenticated) setOpened({ returned: result });
      else if (result) setToast(<span>{calendarReturnCopy(result.provider, result.outcome, result.reason)}</span>);
    },
  });

  if (!opened) return null;

  return (
    <OwnScheduleModal
      open
      onOpenChange={next => !next && setOpened(null)}
      surface={opened.returned?.provider === 'microsoft' ? 'microsoft_calendar' : 'google_calendar'}
      calendarReturn={opened.returned}
    />
  );
}
