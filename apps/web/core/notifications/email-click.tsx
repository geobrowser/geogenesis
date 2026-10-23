'use client';

import * as React from 'react';

import { readEmailClick } from '~/core/deep-links/ref-email';
import { readSession, writeSession } from '~/core/utils/session-storage';
import { storedPrivyAccessToken } from '~/core/wallet/privy-session';

import { geoNotificationsApiUrl, reportEmailClick } from './api';

const REPORTED_KEY = 'geo:email-click:';

/**
 * Counts a click on a link in one of our emails (GEO-3370): when the page an email link opened has
 * loaded and is on screen, it tells geo-notifications which send and which link it was. A link
 * scanner fetches the URL without running this page, so it never counts; a browser driven by
 * automation (`navigator.webdriver`) doesn't either, nor a tab opened in the background until it is
 * looked at. Works signed out: the send names the recipient.
 *
 * Once per send and link per browser session, so a reload or a later visit to the same URL in the
 * tab doesn't count again. The URL keeps its parameters: the analytics landing URL joins the
 * session to the send. Mounted once, app-wide.
 */
export function EmailClickReporter() {
  React.useEffect(() => {
    const baseUrl = geoNotificationsApiUrl();
    const click = readEmailClick(new URLSearchParams(window.location.search));
    if (!baseUrl || !click || navigator.webdriver) return;
    const key = `${REPORTED_KEY}${click.sendId}:${click.link ?? ''}`;
    if (readSession(key)) return;

    const report = () => {
      if (document.visibilityState !== 'visible' || readSession(key)) return;
      document.removeEventListener('visibilitychange', report);
      // With storage blocked a reload reports again; the service drops a repeat within half an hour.
      writeSession(key, '1');
      void reportEmailClick(baseUrl, {
        send_id: click.sendId,
        link: click.link,
        signed_in: storedPrivyAccessToken() !== null,
      }).catch(() => {
        // Offline or the service is down: this click goes uncounted, the visit still counts.
      });
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, []);

  return null;
}
