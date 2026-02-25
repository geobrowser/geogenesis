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
