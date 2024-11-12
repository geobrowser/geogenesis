import { Effect, Either } from 'effect';

import { mapIpfsProposalToSchemaProposalByType } from '../proposals-created/map-proposals';
import type { EditProposal } from '../proposals-created/parser';
import { Accounts, Proposals, Versions } from '~/sink/db';
import { Edits } from '~/sink/db/edits';
import { Transaction } from '~/sink/db/transaction';
import { CouldNotWriteAccountsError } from '~/sink/errors';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';
import { aggregateNewVersions } from '~/sink/write-edits/aggregate-versions';
import { mergeOpsWithPreviousVersions } from '~/sink/write-edits/merge-ops-with-previous-versions';
import { writeEdits } from '~/sink/write-edits/write-edits';

class CouldNotWriteInitialSpaceProposalsError extends Error {
  _tag: 'CouldNotWriteInitialSpaceProposalsError' = 'CouldNotWriteInitialSpaceProposalsError';
}

interface InitialContentArgs {
  editType: 'IMPORT' | 'DEFAULT';
  proposals: EditProposal[];
  block: BlockEvent;
}

export function createInitialContentForSpace(args: InitialContentArgs) {
  const { editType, proposals: proposalsFromIpfs, block } = args;
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    slog({
      requestId: block.requestId,
      message: `Writing accounts for proposals for edits without proposals`,
    });

    // If we are importing a space we need to make accounts for any creators
    // that don't already exist on this chain.
    const initialAccounts = [
      ...new Set(
        proposalsFromIpfs.map(p => {
          return p.creator;
        })
      ),
    ].map(creator => ({
      id: creator,
    }));

    const writtenAccounts = yield* _(
      Effect.tryPromise({
        try: async () => {
          await Accounts.upsert(initialAccounts);
        },
        catch: error => new CouldNotWriteAccountsError(String(error)),
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenAccounts)) {
      const error = writtenAccounts.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write accounts when writing proposals for edits without proposals
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    // @TODO: We need a special function to map a proposal endtime to be now
    const { schemaEditProposals } = mapIpfsProposalToSchemaProposalByType(proposalsFromIpfs, block);

    const versionsWithStaleEntities = yield* _(
      aggregateNewVersions({
        block,
        edits: schemaEditProposals.edits,
        ipfsVersions: schemaEditProposals.versions,
        opsByEditId: schemaEditProposals.opsByEditId,
        opsByEntityId: schemaEditProposals.opsByEntityId,
        editType,
      })
    );

    slog({
      requestId: block.requestId,
      message: `Writing edits, proposals, and versions for edits without proposals`,
    });

    // @TODO transactions are pretty slow for actual content writing for now, so
    // we are skipping writing the actual content in a transaction for now.
    for (const edit of schemaEditProposals.edits) {
      // @TODO this is nested af
      const write = Effect.tryPromise({
        try: async () => {
          return await Transaction.run(async client => {
            // @TODO this can probably go into an effect somewhere that's defined after
            // we aggregate all the appropriate data to write.
            await Promise.all([
              Edits.upsert([edit], { client }),
              Proposals.upsert(
                schemaEditProposals.proposals.filter(p => p.edit_id?.toString() === edit.id),
                { client }
              ),
              Versions.upsert(
                versionsWithStaleEntities.filter(v => v.edit_id.toString() === edit.id),
                { chunked: true, client }
              ),
            ]);

            return true;
          });
        },
        catch: error => new CouldNotWriteInitialSpaceProposalsError(String(error)),
      });

      yield* _(write);
    }

    slog({
      requestId: block.requestId,
      message: `Writing content for edits without proposals`,
    });

    const opsByNewVersions = yield* _(
      mergeOpsWithPreviousVersions({
        edits: schemaEditProposals.edits,
        opsByVersionId: schemaEditProposals.opsByVersionId,
        versions: versionsWithStaleEntities,
      })
    );

    const populateResult = yield* _(
      Effect.either(
        writeEdits({
          versions: versionsWithStaleEntities,
          opsByVersionId: opsByNewVersions,
          block,
          editType,
          edits: schemaEditProposals.edits,
        })
      )
    );

    Either.match(populateResult, {
      onRight: () => {
        slog({
          requestId: block.requestId,
          message: 'Edits from content proposals written successfully!',
        });
      },
      onLeft: error => {
        telemetry.captureException(error);

        slog({
          requestId: block.requestId,
          message: `Could not write proposals for edits without proposals ${error.message}`,
          level: 'error',
        });
      },
    });

    slog({
      requestId: block.requestId,
      message: 'Proposals for edits without proposals written successfully!',
    });
  });
}
