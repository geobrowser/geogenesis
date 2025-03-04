import { Edit, Import, ImportEdit, IpfsMetadata } from '@graphprotocol/grc-20/proto';
import { Effect, Either } from 'effect';
import { z } from 'zod';

import { type DecodedEdit, type DecodedImportEdit, ZodEdit, ZodImportEdit, ZodIpfsMetadata } from './schema';

export class CouldNotDecodeProtobufError extends Error {
  _tag: 'CouldNotDecodeProtobufError' = 'CouldNotDecodeProtobufError';
}

/**
 * decode(() => Edit.fromBinary(Buffer.from('')));
 */
export function decode<T>(fn: () => T) {
  return Effect.gen(function* (_) {
    const result = yield* _(
      Effect.try({
        try: () => fn(),
        catch: error => new CouldNotDecodeProtobufError(String(error)),
      }),
      Effect.either
    );

    if (Either.isLeft(result)) {
      const error = result.left;
      yield* _(
        Effect.logError(`Could not decode protobuf
        Cause: ${error.cause}
        Message: ${error.message}
      `)
      );
      return null;
    }

    return result.right;
  });
}

function decodeIpfsMetadata(data: Buffer): Effect.Effect<z.infer<typeof ZodIpfsMetadata> | null> {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const metadata = IpfsMetadata.fromBinary(data);
      const parseResult = ZodIpfsMetadata.safeParse(metadata.toJson());

      if (parseResult.success) {
        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}

function decodeEdit(data: Buffer): Effect.Effect<DecodedEdit | null> {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const edit = Edit.fromBinary(data);
      const parseResult = ZodEdit.safeParse(edit);

      // @TODO: Implement IMPORT_FILE Op
      // @TODO: Postprocess ops in separate function. This will map
      //        to substream ops

      if (parseResult.success) {
        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}

/**
 * Import edits differ from regular edits in that they are processed
 * when importing a space into another space. The import edit includes
 * extra metadata that would normally be derived onchain, like the message
 * sender, when it was posted onchain, etc., in order to correctly preserve
 * history at the time the data in the original space was created.
 */
function decodeImportEdit(data: Buffer): Effect.Effect<DecodedImportEdit | null> {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const edit = ImportEdit.fromBinary(data);
      const parseResult = ZodImportEdit.safeParse(edit);

      if (parseResult.success) {
        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}

const ZodImport = z.object({
  version: z.string(),
  name: z.string(),
  previousNetwork: z.string(),
  previousContractAddress: z.string(),
  edits: z.array(z.string()),
});

function decodeImport(data: Buffer) {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const importResult = Import.fromBinary(data);
      const parseResult = ZodImport.safeParse(importResult.toJson());

      if (parseResult.success) {
        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}

export const Decoder = {
  decodeIpfsMetadata,
  decodeEdit,
  decodeImport,
  decodeImportEdit,
};
