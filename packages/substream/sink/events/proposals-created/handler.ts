import { Effect } from 'effect';

import type { ChainEditProposal } from '../schema/proposal';
import { getProposalFromIpfs } from './get-proposal-from-ipfs';
import { Proposals, Versions } from '~/sink/db';
import { Edits } from '~/sink/db/edits';
import { mapIpfsProposalToSchemaProposalByType } from '~/sink/events/proposals-created/map-proposals';
import type { BlockEvent, SinkEditProposal } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { aggregateNewVersions } from '~/sink/write-edits/aggregate-versions';
import { mergeOpsWithPreviousVersions } from '~/sink/write-edits/merge-ops-with-previous-versions';
import { writeEdits } from '~/sink/write-edits/write-edits';

class CouldNotWriteCreatedProposalsError extends Error {
  _tag: 'CouldNotWriteCreatedProposalsError' = 'CouldNotWriteCreatedProposalsError';
}

export function handleEditProposalCreated(proposalsCreated: ChainEditProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('Handling proposals created'));
    yield* _(Effect.logDebug(`Gathering IPFS content for ${proposalsCreated.length} proposals`));

    const maybeProposals = yield* _(
      Effect.forEach(proposalsCreated, proposal => getProposalFromIpfs(proposal), {
        concurrency: 20,
      })
    );

    const proposals = maybeProposals.filter(
      (maybeProposal): maybeProposal is SinkEditProposal => maybeProposal !== null
    );

    const { schemaEditProposals } = mapIpfsProposalToSchemaProposalByType(proposals, block);

    yield* _(Effect.logDebug('Writing accounts'));

    // This might be the very first onchain interaction for a wallet address,
    // so we need to make sure that any accounts are already created when we
    // process the proposals below, particularly for editor and member requests.
    // yield* _(writeAccounts([...schemaMembershipProposals.accounts, ...schemaEditorshipProposals.accounts]));

    yield* _(Effect.logDebug(`Writing edit proposals: ${schemaEditProposals.proposals.length}`));

    const versionsWithStaleEntities = yield* _(
      aggregateNewVersions({
        block,
        edits: schemaEditProposals.edits,
        ipfsVersions: schemaEditProposals.versions,
        opsByEditId: schemaEditProposals.opsByEditId,
        opsByEntityId: schemaEditProposals.opsByEntityId,
        editType: 'DEFAULT',
      })
    );

    yield* _(Effect.logDebug('Writing proposals + metadata'));

    // @TODO: Put this in a transaction since all these writes are related
    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Promise.all([
            // Content proposals
            Edits.upsert(schemaEditProposals.edits),
            Proposals.upsert(schemaEditProposals.proposals),
            Versions.upsert(versionsWithStaleEntities),
          ]);
        },
        catch: error => {
          return new CouldNotWriteCreatedProposalsError(String(error));
        },
      }),
      retryEffect
    );

    const opsByVersionId = yield* _(
      mergeOpsWithPreviousVersions({
        edits: schemaEditProposals.edits,
        opsByVersionId: schemaEditProposals.opsByVersionId,
        versions: versionsWithStaleEntities,
      })
    );

    yield* _(
      Effect.either(
        writeEdits({
          versions: versionsWithStaleEntities,
          opsByEditId: schemaEditProposals.opsByEditId,
          opsByVersionId,
          block,
          editType: 'DEFAULT',
          edits: schemaEditProposals.edits,
        })
      )
    );
  });
}
