import { NETWORK_IDS, getChecksumAddress } from '@geogenesis/sdk';
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
import { getProposalFromIpfs } from './get-proposal-from-ipfs';
import { Proposals, ProposedEditors, ProposedMembers, ProposedSubspaces, Versions } from '~/sink/db';
import { Edits } from '~/sink/db/edits';
import { mapIpfsProposalToSchemaProposalByType } from '~/sink/events/proposals-created/map-proposals';
import type {
  BlockEvent,
  SinkEditProposal,
  SinkEditorshipProposal,
  SinkMembershipProposal,
  SinkSubspaceProposal,
} from '~/sink/types';
import { deriveProposalId, deriveSpaceId } from '~/sink/utils/id';
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

export function handleMembershipProposalsCreated(
  proposalsCreated: (ChainAddMemberProposal | ChainRemoveMemberProposal)[],
  block: BlockEvent
) {
  return Effect.gen(function* (_) {
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
          space: deriveSpaceId({ address: p.daoAddress, network: NETWORK_IDS.GEO }),
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
        space: deriveSpaceId({ address: p.daoAddress, network: NETWORK_IDS.GEO }),
        type: 'REMOVE_MEMBER',
      };
    });

    const { schemaMembershipProposals } = mapIpfsProposalToSchemaProposalByType(proposals, block);

    // This might be the very first onchain interaction for a wallet address,
    // so we need to make sure that any accounts are already created when we
    // process the proposals below, particularly for editor and member requests.
    yield* _(writeAccounts(schemaMembershipProposals.accounts));

    yield* _(Effect.logDebug(`Writing membership proposals: ${schemaMembershipProposals.proposals.length}`));

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
      }),
      retryEffect
    );

    yield* _(Effect.logDebug('Membership proposals written'));
  });
}

export function handleEditorshipProposalsCreated(
  proposalsCreated: (ChainAddEditorProposal | ChainRemoveEditorProposal)[],
  block: BlockEvent
) {
  return Effect.gen(function* (_) {
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
          space: deriveSpaceId({ address: p.daoAddress, network: NETWORK_IDS.GEO }),
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
        space: deriveSpaceId({ address: p.daoAddress, network: NETWORK_IDS.GEO }),
        type: 'REMOVE_EDITOR',
      };
    });

    const { schemaEditorshipProposals } = mapIpfsProposalToSchemaProposalByType(proposals, block);

    // This might be the very first onchain interaction for a wallet address,
    // so we need to make sure that any accounts are already created when we
    // process the proposals below, particularly for editor and member requests.
    yield* _(writeAccounts(schemaEditorshipProposals.accounts));

    yield* _(Effect.logDebug(`Writing membership proposals: ${schemaEditorshipProposals.proposals.length}`));

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
      }),
      retryEffect
    );
  });
}

export function handleSubspaceProposalsCreated(
  proposalsCreated: (ChainAddSubspaceProposal | ChainRemoveSubspaceProposal)[],
  block: BlockEvent
) {
  return Effect.gen(function* (_) {
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
          subspace: deriveSpaceId({ address: subspaceAddress, network: NETWORK_IDS.GEO }),
          space: deriveSpaceId({ address: p.daoAddress, network: NETWORK_IDS.GEO }),
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
        subspace: deriveSpaceId({ address: subspaceAddress, network: NETWORK_IDS.GEO }),
        space: deriveSpaceId({ address: p.daoAddress, network: NETWORK_IDS.GEO }),
        type: 'REMOVE_SUBSPACE',
      };
    });

    const { schemaSubspaceProposals } = mapIpfsProposalToSchemaProposalByType(proposals, block);

    yield* _(Effect.logDebug(`Writing subspace proposals: ${schemaSubspaceProposals.proposals.length}`));

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
      }),
      retryEffect
    );
  });
}
