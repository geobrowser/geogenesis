'use client';

import * as React from 'react';

import { readEmailClick } from '~/core/deep-links/ref-email';
import { readSession, writeSession } from '~/core/utils/session-storage';
import { hasPersistedPrivySession } from '~/core/wallet/privy-session';

import { NotificationsRequestError, geoNotificationsApiUrl, reportEmailClick } from './api';

const REPORTED_KEY = 'geo:email-click:';

/**
 * Counts a click on a link in one of our emails (GEO-3370): when the page an email link opened has
 * loaded and is on screen, it tells geo-notifications which send and which link it was. A link
 * scanner fetches the URL without running this page, so it never counts; a browser driven by
 * automation (`navigator.webdriver`) doesn't either, nor a tab opened in the background until it is
 * looked at. Works signed out: the send names the recipient.
 *
 * Once per send and link per tab, once the service has answered, so a reload doesn't count again
 * but a report that failed is tried again on the next load. Two tabs opened from the same link are
 * collapsed by the service, which drops a repeat within half an hour. The URL keeps its parameters:
 * the analytics landing URL joins the session to the send. Mounted once, app-wide.
 */
export function EmailClickReporter() {
  React.useEffect(() => {
    const baseUrl = geoNotificationsApiUrl();
    const click = readEmailClick(new URLSearchParams(window.location.search));
    if (!baseUrl || !click || navigator.webdriver) return;
    const key = `${REPORTED_KEY}${click.sendId}:${click.link ?? ''}`;
    if (readSession(key)) return;

    // This page load reports at most once, even with storage blocked.
    let sent = false;
    const report = () => {
      if (sent || document.visibilityState !== 'visible') return;
      sent = true;
      document.removeEventListener('visibilitychange', report);
      reportEmailClick(baseUrl, {
        send_id: click.sendId,
        link: click.link,
        signed_in: hasPersistedPrivySession(),
      }).then(
        () => writeSession(key, '1'),
        (error: unknown) => {
          // An unknown send won't become known; anything else (offline, the service down) is tried
          // again on the next load of this link.
          if (error instanceof NotificationsRequestError && error.status === 404) writeSession(key, '1');
        }
      );
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, []);

  return null;
}
