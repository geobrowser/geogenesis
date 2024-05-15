import { Effect, Either } from 'effect';

// import { Telemetry } from '~/sink/telemetry';
import { slog } from '~/sink/utils/slog';

export class CouldNotDecodeProtobufError extends Error {
  _tag: 'CouldNotDecodeProtobufError' = 'CouldNotDecodeProtobufError';
}

/**
 * decode(() => Edit.fromBinary(Buffer.from('')));
 */
export function decode<T>(fn: () => T) {
  return Effect.gen(function* (_) {
    // const telemetry = yield* _(Telemetry);

    const edit = yield* _(
      Effect.try({
        try: () => fn(),
        catch: error => new CouldNotDecodeProtobufError(String(error)),
      }),
      Effect.either
    );

    return Either.match(edit, {
      onLeft: error => {
        // telemetry.captureException(error);

        slog({
          level: 'error',
          requestId: '-1',
          message: `Could not decode protobuf
            Cause: ${error.cause}
            Message: ${error.message}
          `,
        });

        return null;
      },
      onRight: value => {
        return value;
      },
    });
  });
}
