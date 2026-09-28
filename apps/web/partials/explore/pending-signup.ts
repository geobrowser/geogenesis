/**
 * The account attempt someone is part-way through, kept so a navigation does not strand them.
 *
 * The capture records its dismissal the moment a subscribe succeeds — which is right, since the
 * newsletter signup is done and should not be asked for again. But it also means that once the card
 * unmounts there is nothing to bring it back: `dismissed` is true and the `status === 'done'`
 * exception that keeps the confirmation on screen lives in component state, which a client-side
 * navigation throws away.
 *
 * So: subscribe, press Create account, wait for the code, click a link while waiting — and come
 * back holding a valid Privy code with nowhere to type it and no way to ask for the field again.
 *
 * `sessionStorage` rather than the persisted notice store, because this is one attempt in one tab,
 * not a decision to remember. It expires on its own for the same reason the code does.
 */
const KEY = 'exploreEmailCapturePendingSignup';

/**
 * Roughly how long a Privy code stays usable. Past that there is nothing to resume into — bringing
 * the step back would only offer a field for a code that no longer works.
 */
const PENDING_TTL_MS = 10 * 60 * 1000;

type PendingSignup = { email: string; startedAt: number };

export function readPendingSignup(): PendingSignup | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingSignup>;
    if (typeof parsed.email !== 'string' || typeof parsed.startedAt !== 'number') return null;
    if (Date.now() - parsed.startedAt > PENDING_TTL_MS) {
      clearPendingSignup();
      return null;
    }

    return { email: parsed.email, startedAt: parsed.startedAt };
  } catch {
    // Private windows, cleared storage, a browser refusing it outright. Resuming is a convenience;
    // losing it must not take the card down with it.
    return null;
  }
}

export function writePendingSignup(email: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ email, startedAt: Date.now() }));
  } catch {
    // As above — the flow still works, it just will not survive a navigation.
  }
}

export function clearPendingSignup(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do; a stale record expires on its own.
  }
}
