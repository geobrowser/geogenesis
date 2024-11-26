import { Effect } from 'effect';

import { writeAccounts } from '../write-accounts';
import { getProposalFromIpfs } from './get-proposal-from-ipfs';
import { Proposals, ProposedEditors, ProposedMembers, ProposedSubspaces, Versions } from '~/sink/db';
import { Edits } from '~/sink/db/edits';
import { mapIpfsProposalToSchemaProposalByType } from '~/sink/events/proposals-created/map-proposals';
import type {
  EditProposal,
  EditorshipProposal,
  MembershipProposal,
  ProposalCreated,
  SubspaceProposal,
} from '~/sink/events/proposals-created/parser';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { aggregateNewVersions } from '~/sink/write-edits/aggregate-versions';
import { mergeOpsWithPreviousVersions } from '~/sink/write-edits/merge-ops-with-previous-versions';
import { writeEdits } from '~/sink/write-edits/write-edits';

class CouldNotWriteCreatedProposalsError extends Error {
  _tag: 'CouldNotWriteCreatedProposalsError' = 'CouldNotWriteCreatedProposalsError';
}

export function handleProposalsCreated(proposalsCreated: ProposalCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('Handling proposals created'));

    yield* _(Effect.logDebug(`Gathering IPFS content for ${proposalsCreated.length} proposals`));

    const maybeProposals = yield* _(
      Effect.forEach(proposalsCreated, proposal => getProposalFromIpfs(proposal), {
        concurrency: 20,
      })
    );

    const proposals = maybeProposals.filter(
      (maybeProposal): maybeProposal is EditProposal | SubspaceProposal | MembershipProposal | EditorshipProposal =>
        maybeProposal !== null
    );

    const { schemaEditProposals, schemaSubspaceProposals, schemaMembershipProposals, schemaEditorshipProposals } =
      mapIpfsProposalToSchemaProposalByType(proposals, block);

    yield* _(Effect.logDebug('Writing accounts'));

    // This might be the very first onchain interaction for a wallet address,
    // so we need to make sure that any accounts are already created when we
    // process the proposals below, particularly for editor and member requests.
    yield* _(writeAccounts([...schemaMembershipProposals.accounts, ...schemaEditorshipProposals.accounts]));

    yield* _(
      Effect.logDebug(`Writing proposals
      Edit proposals: ${schemaEditProposals.proposals.length}
      Subspace proposals: ${schemaSubspaceProposals.proposals.length}
      Editor proposals: ${schemaEditorshipProposals.proposals.length}
      Member proposals: ${schemaMembershipProposals.proposals.length}
    `)
    );

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

            // Subspace proposals
            Proposals.upsert(schemaSubspaceProposals.proposals),
            // Editorship proposals
            Proposals.upsert(schemaEditorshipProposals.proposals),
            // Membership proposals
            Proposals.upsert(schemaMembershipProposals.proposals),

            ProposedSubspaces.upsert(schemaSubspaceProposals.proposedSubspaces),
            ProposedEditors.upsert(schemaEditorshipProposals.proposedEditors),
            ProposedMembers.upsert(schemaMembershipProposals.proposedMembers),
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
