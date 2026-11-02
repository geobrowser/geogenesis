'use client';

import * as React from 'react';

import { readEmailClick } from '~/core/deep-links/ref-email';
import { readSession, removeSession, writeSession } from '~/core/utils/session-storage';
import { hasPersistedPrivySession } from '~/core/wallet/privy-session';

import { NotificationsRequestError, geoNotificationsApiUrl, reportEmailClick } from './api';

type EmailClick = { sendId: string; link: string | null };
/** A click as reported: `signedIn` is settled at the first attempt, so a retry reports the landing. */
type ReportedClick = EmailClick & { signedIn: boolean };

/** Clicks reported but not yet answered: tried again on the next page load in this tab. */
const PENDING_KEY = 'geo:email-click-pending';

const sameClick = (a: EmailClick, b: EmailClick) => a.sendId === b.sendId && a.link === b.link;

/**
 * Whether a failed report is the service's last word on it: any 4xx but a timeout (408) or too many
 * requests (429). An unknown send (404) won't become known, and a refused body (400, 413) would be
 * refused on every load, a quiet retry loop if the client and service checks ever drift apart.
 * Anything else (offline, the service down) stays pending for the next load.
 */
function isFinalAnswer(error: unknown): boolean {
  return (
    error instanceof NotificationsRequestError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

function readPending(): ReportedClick[] {
  try {
    const pending: unknown = JSON.parse(readSession(PENDING_KEY) ?? '[]');
    return Array.isArray(pending)
      ? pending.filter((c): c is ReportedClick => typeof c?.sendId === 'string' && typeof c?.signedIn === 'boolean')
      : [];
  } catch {
    return [];
  }
}

function writePending(update: (pending: ReportedClick[]) => ReportedClick[]) {
  const next = update(readPending());
  if (next.length) writeSession(PENDING_KEY, JSON.stringify(next));
  else removeSession(PENDING_KEY);
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
 * only campaign parameters, in `page_search` too). Until the service answers, each click waits in
 * session storage with the signed-in state it was first reported with, so a report that failed is
 * tried again on the next load in the tab, and a second email opened there doesn't push it out.
 * Mounted once, app-wide.
 */
export function EmailClickReporter() {
  // Read once per mount: earlier clicks still waiting for an answer, then this landing's own (whose
  // signed-in state is read when it is reported).
  const [clicks] = React.useState<(EmailClick & { signedIn?: boolean })[]>(() => {
    if (typeof window === 'undefined') return [];
    const pending = readPending();
    const landed = readEmailClick(new URLSearchParams(window.location.search));
    return landed && !pending.some(c => sameClick(c, landed)) ? [...pending, landed] : pending;
  });
  const sent = React.useRef(false);

  React.useEffect(() => {
    const baseUrl = geoNotificationsApiUrl();
    if (!baseUrl || !clicks.length || navigator.webdriver) return;

    const report = () => {
      if (sent.current || document.visibilityState !== 'visible') return;
      sent.current = true;
      document.removeEventListener('visibilitychange', report);
      for (const click of clicks) {
        const reported: ReportedClick = {
          sendId: click.sendId,
          link: click.link,
          signedIn: click.signedIn ?? hasPersistedPrivySession(),
        };
        writePending(pending => [...pending.filter(c => !sameClick(c, reported)), reported]);
        const answered = () => writePending(pending => pending.filter(c => !sameClick(c, reported)));
        reportEmailClick(baseUrl, {
          send_id: reported.sendId,
          link: reported.link,
          signed_in: reported.signedIn,
        }).then(answered, (error: unknown) => {
          if (isFinalAnswer(error)) answered();
        });
      }
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [clicks]);

  return null;
}
