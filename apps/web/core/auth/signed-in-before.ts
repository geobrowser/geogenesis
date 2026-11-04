/**
 * Whether this browser has had a signed-in session, so a sign-in attempt can be read as likely
 * returning from its start (GEO-3550). Set on any sign-in or session restore, never cleared by
 * sign-out. Starts empty for every browser when it ships.
 */
const KEY = 'geo:signed-in-before:v1';

export function markSignedInBefore() {
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
