'use client';

import * as React from 'react';

import { storedPrivyAccessToken } from '~/core/wallet/privy-session';

import { geoNotificationsApiUrl, reportEmailClick } from './api';

/** The send an email link came from (GEO-3369/3370): an id geo-notifications gave the email. */
export const REF_SEND_PARAM = 'ref_send';
/** Which link in the email it was (GEO-3370). Same shape geo-notifications accepts. */
export const REF_LINK_PARAM = 'ref_link';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_PATTERN = /^[a-z0-9][a-z0-9_]{0,31}$/;

/** The click this landing URL carries, or null when it didn't come from a tagged email link. */
export function readEmailClick(search: string): { sendId: string; link: string | null } | null {
  const params = new URLSearchParams(search);
  const sendId = params.get(REF_SEND_PARAM)?.trim();
  if (!sendId || !UUID_PATTERN.test(sendId)) return null;
  const link = params.get(REF_LINK_PARAM)?.trim();
  return { sendId: sendId.toLowerCase(), link: link && LINK_PATTERN.test(link) ? link : null };
}

const REPORTED_KEY = 'geo:email-click:';

function alreadyReported(key: string): boolean {
  try {
    return window.sessionStorage.getItem(REPORTED_KEY + key) === '1';
  } catch {
    return false;
  }
}

function markReported(key: string) {
  try {
    window.sessionStorage.setItem(REPORTED_KEY + key, '1');
  } catch {
    // Storage blocked: the service drops a repeat within half an hour anyway.
  }
}

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
    const click = readEmailClick(window.location.search);
    if (!baseUrl || !click || navigator.webdriver) return;
    const key = `${click.sendId}:${click.link ?? ''}`;
    if (alreadyReported(key)) return;

    const report = () => {
      if (document.visibilityState !== 'visible' || alreadyReported(key)) return;
      document.removeEventListener('visibilitychange', report);
      markReported(key);
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
