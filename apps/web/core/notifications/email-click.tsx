'use client';

import * as React from 'react';

import { urlWithoutParams } from '~/core/deep-links/modal-deep-link';
import { REF_LINK_PARAM, REF_SEND_PARAM, readEmailClick } from '~/core/deep-links/ref-email';
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
 * Takes `ref_send` and `ref_link` off the address bar, keeping everything else (`ref_email` included,
 * which the save sheet reads). Only ever before the report goes out, never when it answers: Next turns
 * a `replaceState` into a router restore, which discards any navigation still in flight, so clearing
 * at an arbitrary later moment could swallow a tap or a redirect.
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
 * `ref_send` and `ref_link` leave the address bar as the report goes out, on landing (this effect
 * runs before the page's own, so no navigation is under way yet) or when a background tab is first
 * looked at. Until the service answers, the click is kept in session storage, so a report that
 * failed is tried again on the next load in the tab. Analytics never sees the params: its runtime
 * keeps only campaign parameters in URLs. The service counts only the first click on each link, so
 * a repeat, or a copy of the address that still carries them, adds nothing. Mounted once, app-wide.
 */
export function EmailClickReporter() {
  // Read once per mount, before the URL is cleared, so a second run of the effect still has it.
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
      clearClickFromUrl();
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
