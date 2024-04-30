import * as Sentry from '@sentry/node';
import { Context, Effect } from 'effect';

export function startLogs() {
  if (!process.env.SENTRY_DSN) {
    console.log('Telemetry environment not found. Skipping telemetry.');

    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // We recommend adjusting this value in production, or using tracesSampler
    // for finer control
    tracesSampleRate: 1.0,
  });
}

export function captureException(error: unknown) {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.captureException(error);
}

export function captureMessage(message: string) {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.captureMessage(message);
}

interface ITelemetry {
  captureException: (error: unknown) => void;
  captureMessage: (message: string) => void;
}

export class Telemetry extends Context.Tag('Telemetry')<Telemetry, ITelemetry>() {}

export const TelemetryLive: ITelemetry = {
  // Alternatively we can check for the presence of our Sentry env var and swap implementations here
  // instead of having to read it in each capture method
  captureException,
  captureMessage,
};
