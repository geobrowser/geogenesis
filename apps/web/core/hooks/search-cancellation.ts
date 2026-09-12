/**
 * Whether a failed search was cancelled rather than broken.
 *
 * This decides whether the failure is cached. A cancellation has to be re-thrown
 * so React Query treats it as a cancel; swallowing it into an empty page caches
 * "no matches" under that query's key, and the key only changes when the text
 * does — so the picker sits on an empty list until the searcher types another
 * character. Adding a trailing space was enough to fix it, which is what made it
 * look like a search problem rather than a caching one.
 *
 * Three shapes, because an abort reaches this from three places:
 *
 * - This query's own signal, when React Query cancels us directly.
 * - A `DOMException` named `AbortError`, possibly wrapped a level or two down.
 * - An Effect `FiberFailure` carrying an abort from a *deduplicated inner fetch*.
 *   That is the one that actually bit: the inner request is shared by key, so a
 *   query that starts while a previous one is being cancelled attaches to the
 *   dying promise and receives its rejection. Our own signal is untouched and the
 *   error's name is `FiberFailure`, so neither of the first two checks sees it —
 *   only the message does.
 */
export function isSearchCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;

  // Bounded rather than `while`: a cause chain can be circular, and this runs on
  // a rejected search where the last thing wanted is a hang.
  let cause: unknown = error;
  for (let depth = 0; cause !== null && cause !== undefined && depth < 5; depth++) {
    const step = cause as { name?: unknown; cause?: unknown };
    if (step.name === 'AbortError') return true;
    cause = step.cause;
  }

  // Effect stringifies the wrapped abort; the DOM's own wording for a signal
  // aborted with no reason given.
  return /signal is aborted/i.test(String(error));
}
