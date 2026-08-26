import * as Sentry from '@sentry/nextjs';

import { isTelemetryEnabled } from './config';

type TelemetryUser = {
  id: string;
};

/**
 * Returns the Sentry event id, so a surface that shows the user an error can quote a
 * reference that leads straight back to it. Undefined when telemetry is off or reporting
 * itself failed — callers must treat it as best-effort.
 */
export function reportError(
  error: unknown,
  options?: { tags?: Record<string, string>; contexts?: Record<string, Record<string, unknown>> }
): string | undefined {
  if (!isTelemetryEnabled) {
    return undefined;
  }

  try {
    return Sentry.captureException(error, options);
  } catch (reportingError) {
    console.error('[Telemetry] Failed to capture exception', reportingError);
    return undefined;
  }
}

/**
 * Report an error that an error boundary caught — i.e. one the user is being shown a failure
 * screen for, rather than one swallowed in the background.
 *
 * The `digest` is the load-bearing part. React strips a Server Components error's message in
 * production and hands the client only a digest, so the biggest user-visible error group in
 * this project (GEOGENESIS-9: 1100+ events, 47 users, open since February) reads only
 * "the specific message is omitted" with a single minified frame. The real error is logged
 * server-side under the *same digest* — so without recording it there is no join key between
 * what the user saw and what actually failed, and the group is undiagnosable by construction.
 *
 * `boundary` marks these as user-visible, which separates them from background noise that
 * never reached a screen.
 */
export function reportCaughtError(error: unknown, boundary: string): string | undefined {
  const digest = typeof error === 'object' && error !== null ? (error as { digest?: unknown }).digest : undefined;

  return reportError(error, {
    tags: {
      boundary,
      // Tagged, not just context: the whole point is to filter and group by it, and to paste
      // one the user read off their screen straight into Sentry's search.
      ...(typeof digest === 'string' ? { digest } : {}),
    },
  });
}

/**
 * Adapter for `react-error-boundary`'s `onError`, which is called as `(error, info)`. The second
 * parameter is deliberately `unknown` and ignored: this is passed by reference as
 * `onError={reportBoundaryError}` from several boundaries, so narrowing it to anything else
 * breaks assignability at every one of those call sites.
 */
export function reportBoundaryError(error: unknown, _info?: unknown): string | undefined {
  return reportCaughtError(error, 'component');
}

type TelemetryEvent = {
  /**
   * Stable, low-cardinality name. Sentry groups messages by their text, so a *constant*
   * name with varying tags collapses into one issue whose tag breakdown is the aggregate —
   * which is how these are meant to be read. Interpolating an id into the name instead
   * produces thousands of one-event issues and no aggregate at all.
   */
  name: string;
  /** Indexed and filterable/groupable in Sentry. Low-cardinality values only. */
  tags?: Record<string, string | number | boolean>;
  /** Not indexed — the place for ids, durations and anything high-cardinality. */
  extra?: Record<string, unknown>;
};

/**
 * Report a structured operational event: something worth *counting*, not a failure.
 *
 * Distinct from `reportError` on purpose. An event that isn't an exception has no stack
 * and no error semantics, and routing it through `captureException` would both pollute
 * error rates and get filtered by the client's `allowUrls` stack-frame policy.
 */
export function reportEvent({ name, tags, extra }: TelemetryEvent): void {
  if (!isTelemetryEnabled) {
    return;
  }

  try {
    Sentry.captureMessage(name, { level: 'info', tags, extra });
  } catch (reportingError) {
    console.error('[Telemetry] Failed to capture event', reportingError);
  }
}

export function setTelemetryUser(user: TelemetryUser | null): void {
  if (!isTelemetryEnabled) {
    return;
  }

  try {
    Sentry.setUser(user);
  } catch (reportingError) {
    console.error('[Telemetry] Failed to set user context', reportingError);
  }
}
