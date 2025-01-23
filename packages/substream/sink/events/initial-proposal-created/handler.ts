import { Effect } from 'effect';

import { mapIpfsProposalToSchemaProposalByType } from '../proposals-created/map-proposals';
import { writeAccounts } from '../write-accounts';
import { Proposals, Versions } from '~/sink/db';
import { Edits } from '~/sink/db/edits';
import type { BlockEvent, SinkEditProposal } from '~/sink/types';
import { aggregateNewVersions } from '~/sink/write-edits/aggregate-versions';
import { mergeOpsWithPreviousVersions } from '~/sink/write-edits/merge-ops-with-previous-versions';
import { writeEdits } from '~/sink/write-edits/write-edits';

class CouldNotWriteInitialSpaceProposalsError extends Error {
  _tag: 'CouldNotWriteInitialSpaceProposalsError' = 'CouldNotWriteInitialSpaceProposalsError';
}

interface InitialContentArgs {
  editType: 'IMPORT' | 'DEFAULT';
  proposals: SinkEditProposal[];
  block: BlockEvent;
}

export function createInitialContentForSpaces(args: InitialContentArgs) {
  const { editType, proposals: proposalsFromIpfs, block } = args;
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[INITIAL PROPOSAL CREATED] Started'));

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

    yield* _(writeAccounts(initialAccounts));

    const { schemaEditProposals } = mapIpfsProposalToSchemaProposalByType(proposalsFromIpfs, block);

    const versionsWithStaleEntities = yield* _(
      aggregateNewVersions({
        block,
        edits: schemaEditProposals.edits,
        ipfsVersions: schemaEditProposals.versions,
        relationOpsByEditId: schemaEditProposals.relationOpsByEditId,
        editType,
      })
    );

    yield* _(Effect.logDebug('[INITIAL PROPOSAL CREATED] Writing edits, proposals, versions for each edit'));

    // @TODO transactions are pretty slow for actual content writing for now, so
    // we are skipping writing the actual content in a transaction for now.
    yield* _(
      Effect.tryPromise({
        try: async () => {
          // @TODO this can probably go into an effect somewhere that's defined after
          // we aggregate all the appropriate data to write.
          await Promise.all([
            Edits.upsert(schemaEditProposals.edits),
            Proposals.upsert(schemaEditProposals.proposals),
            Versions.upsert(versionsWithStaleEntities, { chunked: true }),
          ]);

          return true;
        },
        catch: error => new CouldNotWriteInitialSpaceProposalsError(String(error)),
      })
    );

    yield* _(Effect.logDebug('[INITIAL PROPOSAL CREATED] Writing content for edits'));

    const opsByNewVersions = yield* _(
      mergeOpsWithPreviousVersions({
        edits: schemaEditProposals.edits,
        tripleOpsByVersionId: schemaEditProposals.tripleOpsByVersionId,
        versions: versionsWithStaleEntities,
      })
    );

    yield* _(
      writeEdits({
        versions: versionsWithStaleEntities,
        tripleOpsByVersionId: opsByNewVersions,
        relationOpsByEditId: schemaEditProposals.relationOpsByEditId,
        block,
        editType,
        edits: schemaEditProposals.edits,
      })
    );

    yield* _(Effect.logInfo('[INITIAL PROPOSAL CREATED] Ended'));
  });
}
