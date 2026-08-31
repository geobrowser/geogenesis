/**
 * Errors that are reported to Sentry but cannot be acted on, and whose volume hides the ones that
 * can.
 *
 * Kept out of `sentry.server.config.ts` so it can be tested without running `Sentry.init` as an
 * import side effect. The client has its own equivalent for ad-blocked analytics beacons; this is
 * the server half.
 */

type SentryExceptionValue = { value?: string };
type SentryEventLike = { exception?: { values?: SentryExceptionValue[] } };

/**
 * Next aborts a streaming render when the client goes away mid-response — a navigation away, or a
 * cancelled `?_rsc=` prefetch, which the App Router fires on link hover and on viewport entry.
 *
 * That surfaces as an unhandled `Error: The destination stream closed early.` thrown from inside
 * Next's own runtime and reported through `onRequestError`. It is not actionable: the stack contains
 * no application frames, and it is a normal consequence of someone clicking before a prefetch
 * finishes.
 *
 * Measured before filtering: **1,149 occurrences over seven weeks with zero users impacted**, spread
 * evenly across every route — `/space/[id]`, `/home`, `/root`, governance, community — which is what
 * rules out a route-specific bug. It was simultaneously the **largest error group in production**,
 * 265 events in two days, more than every other group combined.
 *
 * That volume is the reason to filter it. GEO-2670 stayed open for two weeks partly because a real
 * user report could not be found among noise like this, and the same triage will be needed again.
 */
const ABORTED_STREAM_MESSAGE = 'The destination stream closed early.';

/**
 * Matched on the message rather than the frame, deliberately. The frames are all inside Next's
 * bundled runtime and their paths carry a version hash (`next@16.3.0-preview.6+4bbfba1a...`), so a
 * frame match would silently stop working on the next Next upgrade — the failure mode being that
 * the noise quietly returns. The message is Next's own and stable across versions.
 *
 * Narrow on purpose: an unrelated stream failure, or this one with a different message, still
 * reports.
 */
export function isAbortedResponseStream(event: SentryEventLike): boolean {
  return (event.exception?.values ?? []).some(value => value.value?.includes(ABORTED_STREAM_MESSAGE) === true);
}
