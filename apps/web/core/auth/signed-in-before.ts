/** This browser has had a signed-in session (GEO-3550 likely returning). Set on sign-in or restore, kept on sign-out. */
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
