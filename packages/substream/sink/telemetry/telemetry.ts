import * as Sentry from '@sentry/node';

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
