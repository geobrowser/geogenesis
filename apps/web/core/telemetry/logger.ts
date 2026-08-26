import * as Sentry from '@sentry/nextjs';

import { isTelemetryEnabled } from './config';

type TelemetryUser = {
  id: string;
};

export function reportError(error: unknown): void {
  if (!isTelemetryEnabled) {
    return;
  }

  try {
    Sentry.captureException(error);
  } catch (reportingError) {
    console.error('[Telemetry] Failed to capture exception', reportingError);
  }
}

export function reportBoundaryError(error: unknown): void {
  reportError(error);
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
