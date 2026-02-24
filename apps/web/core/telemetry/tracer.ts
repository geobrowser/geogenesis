import * as Sentry from '@sentry/nextjs';

export function getBrowserTracingIntegration() {
  return Sentry.browserTracingIntegration();
}
