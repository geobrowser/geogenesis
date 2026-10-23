import type { ReadableParams } from './modal-deep-link';

/**
 * `ref_email`: which of our emails a link came from (GEO-3374). Every link in an email carries it, as
 * attribution only — like `via`, it never triggers anything, and nothing clears it.
 *
 * Never named `source`, which the block link reads as a trigger (see `modal-deep-link`).
 */
export const REF_EMAIL_PARAM = 'ref_email';

/**
 * A slug, never free text. It ends up on analytics events, and the action context's allowlist exists
 * so that text and email addresses can't get there by way of a URL somebody pasted.
 */
const REF_EMAIL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** A parameter's value when it has the shape asked for; anything else reads as absent. */
function readShaped(params: ReadableParams, name: string, pattern: RegExp): string | null {
  const value = params?.get(name)?.trim();
  return value && pattern.test(value) ? value : null;
}

export function readRefEmail(params: ReadableParams): string | null {
  return readShaped(params, REF_EMAIL_PARAM, REF_EMAIL_PATTERN);
}

/** `ref_send`: the send an email link came from, an id geo-notifications gave that email (GEO-3370). */
export const REF_SEND_PARAM = 'ref_send';
/** `ref_link`: which link in the email it was (`main`, `profile`, `claim`, …; GEO-3370). */
export const REF_LINK_PARAM = 'ref_link';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The shape geo-notifications accepts for `ref_link`. */
const REF_LINK_PATTERN = /^[a-z0-9][a-z0-9_]{0,31}$/;

/** The send and link an email link carries, or null when it isn't a tagged email link. */
export function readEmailClick(params: ReadableParams): { sendId: string; link: string | null } | null {
  const sendId = readShaped(params, REF_SEND_PARAM, UUID_PATTERN);
  return sendId ? { sendId: sendId.toLowerCase(), link: readShaped(params, REF_LINK_PARAM, REF_LINK_PATTERN) } : null;
}

/**
 * Marks the browser session as one that started from one of our emails. Everyone they go to already
 * has an account, so for the rest of the visit the save sheet asks them to log in rather than to sign
 * up — wherever they go after landing, which is why it is kept for the session and not read off the
 * URL at the moment of asking.
 */
const EMAIL_ARRIVAL_KEY = 'geo:arrived-from-email';

/** Called on every page load, by something always mounted: the landing URL is the one that counts. */
export function noteEmailArrival(search = window.location.search) {
  if (!readRefEmail(new URLSearchParams(search))) return;
  try {
    window.sessionStorage.setItem(EMAIL_ARRIVAL_KEY, '1');
  } catch {
    // Storage blocked: `arrivedFromEmail` still answers from the URL while it carries the param.
  }
}

export function arrivedFromEmail(search = window.location.search) {
  if (readRefEmail(new URLSearchParams(search))) return true;
  try {
    return window.sessionStorage.getItem(EMAIL_ARRIVAL_KEY) === '1';
  } catch {
    return false;
  }
}
