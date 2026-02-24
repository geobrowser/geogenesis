import * as Resource from '@effect/opentelemetry/Resource';
import * as Tracer from '@effect/opentelemetry/Tracer';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';

import { isTelemetryEnabled } from './config';

const EffectTelemetry = Tracer.layerGlobal.pipe(
  Layer.provideMerge(
    Resource.layer({
      serviceName: 'web',
      attributes: {
        'deployment.environment': process.env.NEXT_PUBLIC_APP_ENV || 'development',
      },
    })
  )
);

const telemetryLayer = isTelemetryEnabled ? EffectTelemetry : Layer.empty;

export const effectTelemetryRuntime = ManagedRuntime.make(telemetryLayer);

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pagehide',
    () => {
      void effectTelemetryRuntime.dispose();
    },
    { once: true }
  );
}

function toRuntimeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error('Telemetry runtime execution failed', { cause: error });
}

export async function runEffectEither<A, E>(effect: Effect.Effect<A, E>) {
  try {
    return await effectTelemetryRuntime.runPromise(Effect.either(effect));
  } catch (error) {
    return Either.left(toRuntimeError(error));
  }
}
