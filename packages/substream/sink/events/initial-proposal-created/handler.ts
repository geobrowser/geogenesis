import { Effect, Either } from 'effect';

import { mapIpfsProposalToSchemaProposalByType } from '../proposals-created/map-proposals';
import type { EditProposal } from '../proposals-created/parser';
import { Accounts, Proposals, Versions } from '~/sink/db';
import { Edits } from '~/sink/db/edits';
import { CouldNotWriteAccountsError } from '~/sink/errors';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';
import { mergeOpsWithPreviousVersions } from '~/sink/write-edits/merge-ops-with-previous-versions';
import { populateContent } from '~/sink/write-edits/populate-content';

class CouldNotWriteInitialSpaceProposalsError extends Error {
  _tag: 'CouldNotWriteInitialSpaceProposalsError' = 'CouldNotWriteInitialSpaceProposalsError';
}

export function handleInitialProposalsCreated(proposalsFromIpfs: EditProposal[], block: BlockEvent) {
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

    slog({
      requestId: block.requestId,
      message: `Writing ${schemaEditProposals.proposals.length} proposals for edits without proposals`,
    });

    // @TODO: Put this in a transaction by edit id since all these writes are related
    const writtenProposals = yield* _(
      Effect.tryPromise({
        try: async () => {
          // @TODO: Transaction
          await Promise.all([
            Edits.upsert(schemaEditProposals.edits),
            Proposals.upsert(schemaEditProposals.proposals),
            Versions.upsert(schemaEditProposals.versions),
          ]);
        },
        catch: error => {
          return new CouldNotWriteInitialSpaceProposalsError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenProposals)) {
      const error = writtenProposals.left;
      telemetry.captureException(error);

      slog({
        requestId: block.requestId,
        message: `Could not write proposals for edits without proposals ${error.message}`,
        level: 'error',
      });

      return;
    }

    const opsByVersionId = yield* _(
      mergeOpsWithPreviousVersions({
        edits: schemaEditProposals.edits,
        opsByVersionId: schemaEditProposals.opsByVersionId,
        versions: schemaEditProposals.versions,
      })
    );

    const populateResult = yield* _(
      Effect.either(
        populateContent({
          versions: schemaEditProposals.versions,
          opsByVersionId,
          edits: [],
          importedEdits: schemaEditProposals.edits,
          block,
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
