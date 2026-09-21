/**
 * An `AbortSignal` that aborts after `ms`, on browsers that do not have the static one.
 *
 * `AbortSignal.timeout` is the right call and is what this uses where it exists, but it arrived
 * well after `AbortController` — Safari only shipped it in 16 — so calling it unconditionally in
 * code that runs in a browser throws a TypeError on older ones. Thrown while building fetch
 * options, that lands in the caller's own catch and is indistinguishable from the network failing,
 * which turns "your browser is a year old" into "subscribing is broken" with nothing to go on.
 *
 * Lifted out of `partials/import/import-resolution.ts`, which had worked this out already and kept
 * it to itself. Shared so the next caller inherits the fallback rather than rediscovering it.
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  // Kept from the original, though the controller never leaves this function and a signal cannot be
  // aborted without it -- so in practice the timer is the only thing that aborts this, and clearing
  // it here is clearing one that has already fired. Harmless, and cheap insurance if this ever
  // starts handing the controller out.
  controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
  return controller.signal;
}
