import * as Sentry from '@sentry/node';
import { Context, Effect, Secret } from 'effect';

import { Environment, EnvironmentLive } from './environment';

interface ITelemetry {
  captureException: (error: unknown) => void;
  captureMessage: (message: string) => void;
}

export class Telemetry extends Context.Tag('Telemetry')<Telemetry, ITelemetry>() {}

const make = Effect.gen(function* (_) {
  const environment = yield* _(Environment);

  if (!environment.telemetryUrl) {
    console.log('Telemetry environment not found. Skipping telemetry.');
  } else {
    console.log('Initializing telemetry using provided telemetry url.');
    Sentry.init({
      dsn: Secret.value(environment.telemetryUrl),

      // We recommend adjusting this value in production, or using tracesSampler
      // for finer control
      tracesSampleRate: 1.0,
    });
  }

  return {
    captureException: (error: unknown) => {
      if (!environment.telemetryUrl) {
        return;
      }

      Sentry.captureException(error);
    },
    captureMessage: (message: string) => {
      if (!environment.telemetryUrl) {
        return;
      }

      Sentry.captureMessage(message);
    },
  };
});

export const TelemetryLive: ITelemetry = Effect.runSync(make.pipe(Effect.provideService(Environment, EnvironmentLive)));
