/**
 * What to undo if the sign-in attempt now open is abandoned — the modal dismissed.
 *
 * App-level rather than held by the control that opened the sign-in. Controls queue the viewer's
 * action at the press precisely so it outlives them, and the same has to hold for withdrawing it:
 * a card that unmounted while the modal was open would otherwise never hear about the dismissal,
 * and its queued action would publish on some later, unrelated sign-in.
 *
 * Driven by `privy-auth-events`, which `PrivyAuthTracker` feeds for the app's lifetime: a new attempt
 * or a completed one clears the list, a dismissal runs it.
 */
let callbacks: (() => void)[] = [];

/** Run `callback` if the current sign-in attempt is abandoned. */
export function onSignInAbandoned(callback: () => void) {
  callbacks.push(callback);
}

export function runSignInAbandoned() {
  const pending = callbacks;
  callbacks = [];
  pending.forEach(callback => callback());
}

export function clearSignInAbandoned() {
  callbacks = [];
}
