'use client';

import * as React from 'react';

import { readEmailClick } from '~/core/deep-links/ref-email';
import { readSession, removeSession, writeSession } from '~/core/utils/session-storage';
import { hasPersistedPrivySession } from '~/core/wallet/privy-session';

import { NotificationsRequestError, geoNotificationsApiUrl, reportEmailClick } from './api';

type EmailClick = { sendId: string; link: string | null };

/** A click reported but not yet answered: tried again on the next page load in this tab. */
const PENDING_KEY = 'geo:email-click-pending';

function readPending(): EmailClick | null {
  try {
    const pending = JSON.parse(readSession(PENDING_KEY) ?? 'null') as EmailClick | null;
    return typeof pending?.sendId === 'string' ? { sendId: pending.sendId, link: pending.link ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Counts a click on a link in one of our emails (GEO-3370): when the page an email link opened has
 * loaded and is on screen, it tells geo-notifications which send and which link it was. A link
 * scanner fetches the URL without running this page, so it never counts; a browser driven by
 * automation (`navigator.webdriver`) doesn't either, nor a tab opened in the background until it is
 * looked at. Works signed out: the send names the recipient.
 *
 * The URL is left as it landed. Rewriting history from here fights Next's router (a `replaceState`
 * before Next patches history wipes its entry state and breaks Back; one after it becomes a router
 * restore that discards a navigation in flight), and nothing needs `ref_send` gone: the service
 * counts only the first click on each link, within two weeks, so a reload or a shared copy of the
 * address adds nothing once the recipient has clicked, and analytics never sees it (its runtime keeps
 * only campaign parameters). Until the service answers, the click waits in session storage, so a
 * report that failed is tried again on the next load in the tab. Mounted once, app-wide.
 */
export function EmailClickReporter() {
  // Read once per mount: a later page load in the tab may carry only the pending entry.
  const [click] = React.useState<EmailClick | null>(() =>
    typeof window === 'undefined'
      ? null
      : (readEmailClick(new URLSearchParams(window.location.search)) ?? readPending())
  );
  const sent = React.useRef(false);

  React.useEffect(() => {
    const baseUrl = geoNotificationsApiUrl();
    if (!baseUrl || !click || navigator.webdriver) return;

    const report = () => {
      if (sent.current || document.visibilityState !== 'visible') return;
      sent.current = true;
      document.removeEventListener('visibilitychange', report);
      writeSession(PENDING_KEY, JSON.stringify(click));
      reportEmailClick(baseUrl, {
        send_id: click.sendId,
        link: click.link,
        signed_in: hasPersistedPrivySession(),
      }).then(
        () => removeSession(PENDING_KEY),
        (error: unknown) => {
          // An unknown send won't become known; anything else (offline, the service down) stays
          // pending for the next load.
          if (error instanceof NotificationsRequestError && error.status === 404) removeSession(PENDING_KEY);
        }
      );
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [click]);

  return null;
}
