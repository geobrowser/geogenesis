import { NetworkIds, getChecksumAddress } from '@graphprotocol/grc-20';
import { Effect } from 'effect';

import type {
  ChainAddEditorProposal,
  ChainAddMemberProposal,
  ChainAddSubspaceProposal,
  ChainEditProposal,
  ChainRemoveEditorProposal,
  ChainRemoveMemberProposal,
  ChainRemoveSubspaceProposal,
} from '../schema/proposal';
import { writeAccounts } from '../write-accounts';
import { getProposalsFromIpfs } from './get-proposal-from-ipfs';
import { Proposals, ProposedEditors, ProposedMembers, ProposedSubspaces, Versions } from '~/sink/db';
import { Edits } from '~/sink/db/edits';
import { Transaction } from '~/sink/db/transaction';
import { mapIpfsProposalToSchemaProposalByType } from '~/sink/events/proposals-created/map-proposals';
import type { BlockEvent, SinkEditorshipProposal, SinkMembershipProposal, SinkSubspaceProposal } from '~/sink/types';
import { deriveProposalId, deriveSpaceId } from '~/sink/utils/id';
import { aggregateNewVersions } from '~/sink/write-edits/aggregate-versions';
import { mergeOpsWithPreviousVersions } from '~/sink/write-edits/merge-ops-with-previous-versions';
import { writeEdits } from '~/sink/write-edits/write-edits';

class CouldNotWriteCreatedProposalsError extends Error {
  _tag: 'CouldNotWriteCreatedProposalsError' = 'CouldNotWriteCreatedProposalsError';
}

export function handleEditProposalCreated(proposalsCreated: ChainEditProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[EDIT PROPOSALS CREATED] Started'));
    yield* _(
      Effect.logDebug(`[EDIT PROPOSALS CREATED] Gathering IPFS content for ${proposalsCreated.length} proposals`)
    );

    const proposals = yield* _(getProposalsFromIpfs(proposalsCreated));
    const { schemaEditProposals } = mapIpfsProposalToSchemaProposalByType(proposals, block);

    /**
     * 1. Get all the ops in an edit and map them to proposals, versions, and groupBy ops
     * 2. Aggregate new versions of entities in the edit based on the ops and relations
     *    This includes new entities, and entities that become stale because a relation
     *    has changed, either with new data or if the relation was created/deleted.
     */

    yield* _(
      Effect.logDebug(`[EDIT PROPOSALS CREATED] Writing edit proposals: ${schemaEditProposals.proposals.length}`)
    );

    const allNewVersionsInEdit = yield* _(
      aggregateNewVersions({
        block,
        edits: schemaEditProposals.edits,
        ipfsVersions: schemaEditProposals.versions,
        relationOpsByEditId: schemaEditProposals.relationOpsByEditId,
        editType: 'DEFAULT',
      })
    );

    yield* _(Effect.logDebug('[EDIT PROPOSALS CREATED] Writing proposals + metadata'));

    const [, opsByVersionId] = yield* _(
      Effect.all(
        [
          Effect.tryPromise({
            try: async () => {
              await Transaction.run(async txClient => {
                await Promise.all([
                  // Content proposals
                  Edits.upsert(schemaEditProposals.edits, { client: txClient }),
                  Proposals.upsert(schemaEditProposals.proposals, { client: txClient }),
                  Versions.copy(allNewVersionsInEdit),
                ]);

                return true;
              });
            },
            catch: error => {
              return new CouldNotWriteCreatedProposalsError(String(error));
            },
          }),
          mergeOpsWithPreviousVersions({
            edits: schemaEditProposals.edits,
            tripleOpsByVersionId: schemaEditProposals.tripleOpsByVersionId,
            versions: allNewVersionsInEdit,
          }),
        ],
        {
          concurrency: 'unbounded',
        }
      )
    );

    yield* _(
      writeEdits({
        versions: allNewVersionsInEdit,
        tripleOpsByVersionId: opsByVersionId,
        relationOpsByEditId: schemaEditProposals.relationOpsByEditId,
        block,
        editType: 'DEFAULT',
        edits: schemaEditProposals.edits,
      })
    );

    yield* _(Effect.logInfo('[EDIT PROPOSALS CREATED] Ended'));
  });
}

export function handleMembershipProposalsCreated(
  proposalsCreated: (ChainAddMemberProposal | ChainRemoveMemberProposal)[],
  block: BlockEvent
) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[MEMBER PROPOSALS CREATED] Started'));

    const proposals: SinkMembershipProposal[] = proposalsCreated.map((p): SinkMembershipProposal => {
      const proposalId = deriveProposalId({ onchainProposalId: p.proposalId, pluginAddress: p.pluginAddress });
      const member = getChecksumAddress(p.member);
      const creator = getChecksumAddress(p.creator);
      const pluginAddress = getChecksumAddress(p.pluginAddress);
      const daoAddress = getChecksumAddress(p.daoAddress);

      if (p.changeType === 'added') {
        return {
          ...p,
          name: `Add member ${member}`,
          daoAddress,
          pluginAddress,
          creator,
          member,
          onchainProposalId: p.proposalId,
          proposalId,
          space: deriveSpaceId({ address: p.daoAddress, network: NetworkIds.GEO }),
          type: 'ADD_MEMBER',
        };
      }

      return {
        ...p,
        name: `Remove member ${member}`,
        daoAddress,
        pluginAddress,
        creator,
        member,
        onchainProposalId: p.proposalId,
        proposalId,
        space: deriveSpaceId({ address: p.daoAddress, network: NetworkIds.GEO }),
        type: 'REMOVE_MEMBER',
      };
    });

    const { schemaMembershipProposals } = mapIpfsProposalToSchemaProposalByType(proposals, block);

    // This might be the very first onchain interaction for a wallet address,
    // so we need to make sure that any accounts are already created when we
    // process the proposals below, particularly for editor and member requests.
    yield* _(writeAccounts(schemaMembershipProposals.accounts));

    yield* _(
      Effect.logDebug(
        `[MEMBER PROPOSALS CREATED] Writing membership proposals: ${schemaMembershipProposals.proposals.length}`
      )
    );

    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Promise.all([
            Proposals.upsert(schemaMembershipProposals.proposals),
            ProposedMembers.upsert(schemaMembershipProposals.proposedMembers),
          ]);
        },
        catch: error => {
          return new CouldNotWriteCreatedProposalsError(String(error));
        },
      })
    );

    yield* _(Effect.logDebug('[MEMBER PROPOSALS CREATED] Ended'));
  });
}

export function handleEditorshipProposalsCreated(
  proposalsCreated: (ChainAddEditorProposal | ChainRemoveEditorProposal)[],
  block: BlockEvent
) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[EDITOR PROPOSALS CREATED] Started'));
    const proposals: SinkEditorshipProposal[] = proposalsCreated.map((p): SinkEditorshipProposal => {
      const proposalId = deriveProposalId({ onchainProposalId: p.proposalId, pluginAddress: p.pluginAddress });
      const editor = getChecksumAddress(p.editor);
      const creator = getChecksumAddress(p.creator);
      const pluginAddress = getChecksumAddress(p.pluginAddress);
      const daoAddress = getChecksumAddress(p.daoAddress);

      if (p.changeType === 'added') {
        return {
          ...p,
          creator,
          daoAddress,
          pluginAddress,
          name: `Add editor ${editor}`,
          onchainProposalId: p.proposalId,
          proposalId,
          space: deriveSpaceId({ address: p.daoAddress, network: NetworkIds.GEO }),
          type: 'ADD_EDITOR',
        };
      }

      return {
        ...p,
        editor,
        creator,
        daoAddress,
        pluginAddress,
        name: `Remove editor ${editor}`,
        onchainProposalId: p.proposalId,
        proposalId,
        space: deriveSpaceId({ address: p.daoAddress, network: NetworkIds.GEO }),
        type: 'REMOVE_EDITOR',
      };
    });

    const { schemaEditorshipProposals } = mapIpfsProposalToSchemaProposalByType(proposals, block);

    // This might be the very first onchain interaction for a wallet address,
    // so we need to make sure that any accounts are already created when we
    // process the proposals below, particularly for editor and member requests.
    yield* _(writeAccounts(schemaEditorshipProposals.accounts));

    yield* _(
      Effect.logDebug(
        `[EDITOR PROPOSALS CREATED] Writing membership proposals: ${schemaEditorshipProposals.proposals.length}`
      )
    );

    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Promise.all([
            Proposals.upsert(schemaEditorshipProposals.proposals),
            ProposedEditors.upsert(schemaEditorshipProposals.proposedEditors),
          ]);
        },
        catch: error => {
          return new CouldNotWriteCreatedProposalsError(String(error));
        },
      })
    );

    yield* _(Effect.logInfo('[EDITOR PROPOSALS CREATED] Ended'));
  });
}

export function handleSubspaceProposalsCreated(
  proposalsCreated: (ChainAddSubspaceProposal | ChainRemoveSubspaceProposal)[],
  block: BlockEvent
) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[SUBSPACE PROPOSALS CREATED] Started'));
    const proposals = proposalsCreated.map((p): SinkSubspaceProposal => {
      const proposalId = deriveProposalId({ onchainProposalId: p.proposalId, pluginAddress: p.pluginAddress });
      const subspaceAddress = getChecksumAddress(p.subspace);
      const creator = getChecksumAddress(p.creator);
      const pluginAddress = getChecksumAddress(p.pluginAddress);
      const daoAddress = getChecksumAddress(p.daoAddress);

      if (p.changeType === 'added') {
        return {
          ...p,
          name: `Add subspace ${subspaceAddress}`,
          creator,
          pluginAddress,
          daoAddress,
          onchainProposalId: p.proposalId,
          proposalId,
          subspace: deriveSpaceId({ address: subspaceAddress, network: NetworkIds.GEO }),
          space: deriveSpaceId({ address: p.daoAddress, network: NetworkIds.GEO }),
          type: 'ADD_SUBSPACE',
        };
      }

      return {
        ...p,
        name: `Remove subspace ${subspaceAddress}`,
        creator,
        pluginAddress,
        daoAddress,
        onchainProposalId: p.proposalId,
        proposalId,
        subspace: deriveSpaceId({ address: subspaceAddress, network: NetworkIds.GEO }),
        space: deriveSpaceId({ address: p.daoAddress, network: NetworkIds.GEO }),
        type: 'REMOVE_SUBSPACE',
      };
    });

    const { schemaSubspaceProposals } = mapIpfsProposalToSchemaProposalByType(proposals, block);

    yield* _(
      Effect.logDebug(
        `[SUBSPACE PROPOSALS CREATED] Writing subspace proposals: ${schemaSubspaceProposals.proposals.length}`
      )
    );

    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Promise.all([
            Proposals.upsert(schemaSubspaceProposals.proposals),
            ProposedSubspaces.upsert(schemaSubspaceProposals.proposedSubspaces),
          ]);
        },
        catch: error => {
          return new CouldNotWriteCreatedProposalsError(String(error));
        },
      })
    );

    yield* _(Effect.logInfo('[SUBSPACE PROPOSALS CREATED] Ended'));
  });
}
