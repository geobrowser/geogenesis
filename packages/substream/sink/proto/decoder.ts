import { Effect, Either } from 'effect';

import { ZodEdit } from '../events/proposals-created/parser';
import { Edit } from '../proto';
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

function decodeEdit(data: Buffer) {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const edit = Edit.fromBinary(data);
      const parseResult = ZodEdit.safeParse(edit.toJson());

      if (parseResult.success) {
        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}

export const Decoder = {
  decodeEdit,
};
