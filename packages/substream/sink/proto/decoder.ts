import { SYSTEM_IDS } from '@geobrowser/gdk';
import { Edit, ImportEdit, IpfsMetadata, Membership, Subspace } from '@geobrowser/gdk/proto';
import { Effect, Either } from 'effect';
import { z } from 'zod';

import {
  type ParsedEdit,
  type ParsedImportEdit,
  ZodEdit,
  ZodEditorshipProposal,
  ZodImportEdit,
  ZodMembershipProposal,
  ZodSubspaceProposal,
} from '../events/proposals-created/parser';
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

    const result = yield* _(
      Effect.try({
        try: () => fn(),
        catch: error => new CouldNotDecodeProtobufError(String(error)),
      }),
      Effect.either
    );

    return Either.match(result, {
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

const ZodIpfsMetadata = z.object({
  version: z.string(),
  type: z.union([
    z.literal('ADD_EDIT'),
    z.literal('ADD_MEMBER'),
    z.literal('REMOVE_MEMBER'),
    z.literal('ADD_EDITOR'),
    z.literal('REMOVE_EDITOR'),
    z.literal('ADD_SUBSPACE'),
    z.literal('REMOVE_SUBSPACE'),
    z.literal('IMPORT_SPACE'),
  ]),
  id: z.string(),
  name: z.string(),
});

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

function decodeEdit(data: Buffer): Effect.Effect<ParsedEdit | null> {
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

/**
 * Import edits differ from regular edits in that they are processed
 * when importing a space into another space. The import edit includes
 * extra metadata that would normally be derived onchain, like the message
 * sender, when it was posted onchain, etc., in order to correctly preserve
 * history at the time the data in the original space was created.
 *
 * @TODO: For some reason right now we need to decode the import edits op
 * in a different way than the normal ADD_EDIT ops. For import edits we
 * don't convert to JSON before parsing, we parse the edit directly. There
 * are zod errors with the imports that we don't get with normal edits if
 * we parse the JSON.
 */
function decodeImportEdit(data: Buffer): Effect.Effect<ParsedImportEdit | null> {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const edit = ImportEdit.fromBinary(data);

      const parseResult = ZodImportEdit.safeParse(edit);

      if (parseResult.success) {
        // @TODO(migration): For now we have some invalid ops while we still work on the data migration
        const validOps = parseResult.data.ops.filter(
          o => o.type === 'SET_TRIPLE' && (o.triple as unknown as any)?.value?.type !== 'FILTER_ME_OUT'
        );

        parseResult.data.ops = validOps;

        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}

function decodeMembership(data: Buffer) {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const memberRequest = Membership.fromBinary(data);
      const parseResult = ZodMembershipProposal.safeParse(memberRequest.toJson());

      if (parseResult.success) {
        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}

function decodeEditorship(data: Buffer) {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const memberRequest = Membership.fromBinary(data);
      const parseResult = ZodEditorshipProposal.safeParse(memberRequest.toJson());

      if (parseResult.success) {
        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}

function decodeSubspace(data: Buffer) {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const subspaceRequest = Subspace.fromBinary(data);
      const parseResult = ZodSubspaceProposal.safeParse(subspaceRequest.toJson());

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
  decodeImportEdit,
  decodeMembership,
  decodeEditorship,
  decodeSubspace,
};
