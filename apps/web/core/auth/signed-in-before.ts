import { isAnalyticsEnabled } from '~/core/analytics-context';

/** This browser has had a signed-in session (GEO-3550 likely returning). Set on sign-in or restore, kept on sign-out. */
const KEY = 'geo:signed-in-before:v1';

/** Only for analytics, so not written with analytics off. */
export function markSignedInBefore() {
  if (!isAnalyticsEnabled) return;
  try {
    if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, '1');
  } catch {
    /* Storage is optional. */
  }
}

export function wasSignedInBefore(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
