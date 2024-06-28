import { Edit, ImportEdit, Membership, Op, Subspace } from '@geogenesis/sdk/proto';
import { Effect, Either } from 'effect';

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
 */
function decodeImportEdit(data: Buffer): Effect.Effect<ParsedImportEdit | null> {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const edit = ImportEdit.fromBinary(data);

      const parseResult = ZodImportEdit.safeParse(edit.toJson());

      if (parseResult.success) {
        // @TODO(migration): For now we have some invalid ops while we still work on the data migration
        const validOps = parseResult.data.ops.filter(
          o => o.opType === 'SET_TRIPLE' && (o.payload as unknown as any).value.type !== 'FILTER_ME_OUT'
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
  decodeEdit,
  decodeImportEdit,
  decodeMembership,
  decodeEditorship,
  decodeSubspace,
};
