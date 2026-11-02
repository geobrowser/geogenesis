'use client';

import * as React from 'react';

import { reportBrowserTimezone } from './api';
import { useGeoChatAuth } from './hooks';

/**
 * The IANA zone this browser is in, e.g. `America/Los_Angeles`, or null when the runtime does not
 * say. geo-chat refuses anything that is not a real zone, so an empty answer is not worth sending.
 */
export function browserTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone.trim() ? zone : null;
  } catch {
    return null;
  }
}

/**
 * Tells geo-chat which zone the signed-in person is in, once per account per page load.
 *
 * Scheduling emails render their times in the recipient's zone, and most are sent while the
 * recipient is not on the page (someone else invites them, a reminder fires), so geo-chat has to
 * have it stored. Until this, the only zone it had was the one on saved availability, and anyone
 * who had never saved availability got every time in UTC.
 *
 * Mounted once, app-wide. Failures are swallowed: a missed report leaves the previous zone, or UTC,
 * and surfacing it would put an error on a page that is otherwise working.
 */
export function BrowserTimezoneReporter() {
  const { ready, authenticated, accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const reportedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!ready || !authenticated || !accountKey || reportedFor.current === accountKey) return;
    const zone = browserTimezone();
    if (!zone) return;
    reportedFor.current = accountKey;
    void reportBrowserTimezone(getPrivyIdentityToken, accountKey, zone).catch(() => undefined);
  }, [ready, authenticated, accountKey, getPrivyIdentityToken]);

  return null;
}
