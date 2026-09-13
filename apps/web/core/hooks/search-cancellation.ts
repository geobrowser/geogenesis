import { isCancelledError } from '@tanstack/react-query';

import * as Cause from 'effect/Cause';
import * as Runtime from 'effect/Runtime';

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
 * An abort reaches this from two directions, and neither is obvious:
 *
 * - **This query's own signal**, when React Query cancels us directly.
 * - **Somebody else's**, because the inner REST fetch is deduplicated by key. A
 *   query starting while a previous one is being cancelled attaches to the dying
 *   promise and inherits its rejection, so our signal stays live. That is the one
 *   that actually bit.
 *
 * The second arrives through `Effect.runPromise`, which tells you almost nothing
 * from the outside: the rejection's own name is `"(FiberFailure) Error"`, it has
 * no `cause` property, and the original hangs off a private symbol. So the wrapper
 * is unwrapped with Effect's own API rather than read off the rendered message —
 * which matters, because what it wraps is not always shaped the same way:
 *
 * - `restFetch` converts an aborted fetch into this repo's **tagged** `AbortError`
 *   (`_tag`, no `name`), which arrives as a typed failure.
 * - An abort that escapes as a **defect** is still the DOM's `AbortError` (`name`,
 *   no `_tag`).
 * - Effect can also interrupt the fiber outright, which carries neither.
 *
 * React Query has a fourth of its own. A caller awaiting `fetchQuery` is rejected
 * with `CancelledError` when that query is cancelled, which never reaches the
 * `queryFn` and so is wrapped by nothing — and it is unrecognisable by shape: its
 * `name` is `"Error"` and it renders as `"Error: CancelledError"`. Only the
 * library's own predicate identifies it, as `debate-gateway` also does.
 */
export function isSearchCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (isCancelledError(error)) return true;

  if (Runtime.isFiberFailure(error)) {
    const cause = error[Runtime.FiberFailureCauseId];
    if (Cause.isInterrupted(cause)) return true;
    if (isAbortShaped(Cause.squash(cause))) return true;
  }

  // Bounded rather than `while`: a cause chain can be circular, and this runs on
  // a rejected search where the last thing wanted is a hang.
  let step: unknown = error;
  for (let depth = 0; step !== null && step !== undefined && depth < 5; depth++) {
    if (isAbortShaped(step)) return true;
    step = (step as { cause?: unknown }).cause;
  }

  // Last resort, for an abort that reaches us as text rather than an object — and
  // as cover for `isFiberFailure` failing to recognise a wrapper built by a second
  // copy of Effect, since being wrong here re-caches the empty page this exists to
  // prevent. Both renderings: the tagged error serialized, and the DOM's own
  // wording for a signal aborted with no reason given.
  const rendered = String(error);
  return /"_tag":\s*"AbortError"/.test(rendered) || /signal is aborted/i.test(rendered);
}

/** The DOM's `AbortError` carries a `name`; this repo's tagged one carries a `_tag`. */
function isAbortShaped(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const { name, _tag } = value as { name?: unknown; _tag?: unknown };
  return name === 'AbortError' || _tag === 'AbortError';
}
