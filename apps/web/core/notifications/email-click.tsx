'use client';

import * as React from 'react';

import { urlWithoutParams } from '~/core/deep-links/modal-deep-link';
import { REF_LINK_PARAM, REF_SEND_PARAM, readEmailClick } from '~/core/deep-links/ref-email';
import { hasPersistedPrivySession } from '~/core/wallet/privy-session';

import { NotificationsRequestError, geoNotificationsApiUrl, reportEmailClick } from './api';

/**
 * Takes `ref_send` and `ref_link` off the address bar, keeping everything else (`ref_email` included,
 * which the save sheet reads). Only the query changes, as when a deep link's trigger is cleared.
 */
function clearClickFromUrl() {
  const { pathname, search, hash } = window.location;
  const next = urlWithoutParams(pathname, new URLSearchParams(search), [REF_SEND_PARAM, REF_LINK_PARAM], hash);
  if (next !== `${pathname}${search}${hash}`) window.history.replaceState(null, '', next);
}

/**
 * Counts a click on a link in one of our emails (GEO-3370): when the page an email link opened has
 * loaded and is on screen, it tells geo-notifications which send and which link it was. A link
 * scanner fetches the URL without running this page, so it never counts; a browser driven by
 * automation (`navigator.webdriver`) doesn't either, nor a tab opened in the background until it is
 * looked at. Works signed out: the send names the recipient.
 *
 * Once the service has answered (or said it doesn't know the send), `ref_send` and `ref_link` leave
 * the address bar if the visitor is still on the page they landed on, so a reload there doesn't report
 * again; a report that failed leaves them, so a reload tries again. This is tidying, not the guard:
 * the landing's history entry, or a deep link clearing its own trigger at the same moment, can still
 * show them, and the service counts only the first click on each link, so a copy of the address adds
 * nothing once the recipient has clicked. Analytics never sees them: its runtime keeps only campaign
 * parameters in URLs. Mounted once, app-wide.
 */
export function EmailClickReporter() {
  // Read once per mount, before the URL is cleared, so a second run of the effect still has it.
  const [click] = React.useState(() =>
    typeof window === 'undefined' ? null : readEmailClick(new URLSearchParams(window.location.search))
  );
  const sent = React.useRef(false);

  React.useEffect(() => {
    const baseUrl = geoNotificationsApiUrl();
    if (!baseUrl || !click || navigator.webdriver) return;

    const report = () => {
      if (sent.current || document.visibilityState !== 'visible') return;
      sent.current = true;
      document.removeEventListener('visibilitychange', report);
      reportEmailClick(baseUrl, {
        send_id: click.sendId,
        link: click.link,
        signed_in: hasPersistedPrivySession(),
      }).then(clearClickFromUrl, (error: unknown) => {
        // An unknown send won't become known; anything else (offline, the service down) is tried
        // again when this URL is loaded again.
        if (error instanceof NotificationsRequestError && error.status === 404) clearClickFromUrl();
      });
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [click]);

  return null;
}
