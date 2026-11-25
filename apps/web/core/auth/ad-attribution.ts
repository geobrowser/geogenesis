'use client';

import type { AnalyticsProperties } from '../analytics';

/**
 * First-touch ad attribution, kept in first-party storage so it is still there when a visitor
 * finishes sign-up: after the passcode round trip, in another tab, or on a later visit. The
 * runtime's own UTM/fbclid fields only describe the page an event fires on, and `signed_up` fires
 * on a page that rarely carries them.
 *
 * Holds the Meta click id (as the `_fbc` value Meta expects, `fb.1.<ms>.<fbclid>`), the `_fbp`
 * browser cookie and the UTM source/medium/campaign/content. No personal data, nothing hashed.
 */

const storageKey = 'geo:ad-attribution:v1';
// Meta's own `_fbc` cookie lifetime.
const maxAgeMs = 90 * 24 * 60 * 60 * 1000;
const maxValueLength = 200;
const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

type AdAttribution = {
  capturedAt: number;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

// Used when browser storage is unavailable, so the current tab still carries it to sign-up.
let memory: AdAttribution | null = null;

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxValueLength) : undefined;
}

function readCookie(name: string): string | undefined {
  try {
    const prefix = `${name}=`;
    const found = document.cookie.split(';').find(part => part.trim().startsWith(prefix));
    return clean(found ? decodeURIComponent(found.trim().slice(prefix.length)) : undefined);
  } catch {
    return undefined;
  }
}

function fbcFor(fbclid: string, now: number): string {
  // Meta's cookie, when the pixel already wrote it for this click id, keeps its original timestamp.
  const cookie = readCookie('_fbc');
  return cookie?.endsWith(`.${fbclid}`) ? cookie : `fb.1.${now}.${fbclid}`;
}

function read(now = Date.now()): AdAttribution | null {
  let candidate: AdAttribution | null = memory;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) candidate = JSON.parse(stored);
  } catch {
    // Storage may be unavailable or hold garbage; fall back to this page's copy.
  }
  if (!candidate || !Number.isFinite(candidate.capturedAt) || now - candidate.capturedAt > maxAgeMs) return null;
  return candidate;
}

function write(value: AdAttribution) {
  memory = value;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Private browsing or quota: the in-memory copy still serves this tab.
  }
}

/**
 * Records this landing's ad signals. The first touch wins, except that a click id replaces a
 * stored touch that had none (an in-app browser can drop UTMs on one page and keep the fbclid on
 * the next). Safe to call on every page load.
 */
export function captureAdAttribution(search: string = window.location.search, now = Date.now()) {
  try {
    const params = new URLSearchParams(search);
    const fbclid = clean(params.get('fbclid'));
    const utms = Object.fromEntries(utmKeys.map(key => [key, clean(params.get(key))]));
    const hasSignal = fbclid || Object.values(utms).some(Boolean);
    const existing = read(now);

    if (!hasSignal) {
      // Nothing new on this page; only fill in the pixel cookie if it appeared since.
      const fbp = readCookie('_fbp');
      if (existing && fbp && !existing.fbp) write({ ...existing, fbp });
      return;
    }
    if (existing && (existing.fbclid || !fbclid)) return;

    write({
      // An upgrade keeps the earlier touch's UTMs; this page only adds what it carries.
      ...existing,
      ...Object.fromEntries(Object.entries(utms).filter(([, value]) => value)),
      capturedAt: existing?.capturedAt ?? now,
      ...(fbclid ? { fbclid, fbc: fbcFor(fbclid, now) } : {}),
      fbp: readCookie('_fbp'),
    });
  } catch {
    // Attribution is observational and must never break a page load.
  }
}

/** The click id and `_fbp` in the names Meta's tags use; for the dataLayer. */
export function adAttributionMarketingParams(): { fbc?: string; fbp?: string; fbclid?: string } {
  const stored = read();
  const fbp = readCookie('_fbp') ?? stored?.fbp;
  return { fbc: stored?.fbc, fbp, fbclid: stored?.fbclid };
}

/** Everything stored, as `signed_up` properties. `first_touch_*` so none collides with the runtime's per-page fields. */
export function adAttributionProperties(): AnalyticsProperties {
  const stored = read();
  if (!stored) return {};
  const fbp = readCookie('_fbp') ?? stored.fbp;
  return {
    first_touch_fbclid: stored.fbclid,
    fbc: stored.fbc,
    fbp,
    first_touch_utm_source: stored.utm_source,
    first_touch_utm_medium: stored.utm_medium,
    first_touch_utm_campaign: stored.utm_campaign,
    first_touch_utm_content: stored.utm_content,
    first_touch_at: new Date(stored.capturedAt).toISOString(),
  };
}

/** Test seam. */
export function resetAdAttributionMemory() {
  memory = null;
}
