import type * as S from 'zapatos/schema';

import { createVersionId } from '../../utils/id';
import type { EditProposal, EditorshipProposal, MembershipProposal, SubspaceProposal } from './parser';
import type { GeoBlock } from '~/sink/types';

function groupProposalsByType(
  proposals: (MembershipProposal | SubspaceProposal | EditorshipProposal | EditProposal)[]
): {
  memberProposals: MembershipProposal[];
  editorProposals: EditorshipProposal[];
  subspaceProposals: SubspaceProposal[];
  editProposals: EditProposal[];
} {
  const editProposals = proposals.flatMap(p => (p.type === 'ADD_EDIT' ? p : []));
  const memberProposals = proposals.flatMap(p => (p.type === 'ADD_MEMBER' || p.type === 'REMOVE_MEMBER' ? p : []));
  const editorProposals = proposals.flatMap(p => (p.type === 'ADD_EDITOR' || p.type === 'REMOVE_EDITOR' ? p : []));
  const subspaceProposals = proposals.flatMap(p =>
    p.type === 'ADD_SUBSPACE' || p.type === 'REMOVE_SUBSPACE' ? p : []
  );

  return {
    memberProposals,
    editorProposals,
    subspaceProposals,
    editProposals,
  };
}

function mapEditorshipProposalsToSchema(
  proposals: EditorshipProposal[],
  block: GeoBlock
): {
  proposals: S.proposals.Insertable[];
  proposedEditors: S.proposed_editors.Insertable[];
  accounts: S.accounts.Insertable[];
} {
  const proposalsToWrite: S.proposals.Insertable[] = [];
  const proposedEditorsToWrite: S.proposed_editors.Insertable[] = [];
  const accountsToWrite: S.accounts.Insertable[] = [];

  for (const p of proposals) {
    const spaceId = p.space;

    const proposalToWrite: S.proposals.Insertable = {
      id: p.proposalId,
      onchain_proposal_id: p.onchainProposalId,
      plugin_address: p.pluginAddress,
      name: p.name,
      type: p.type,
      created_at: p.startTime,
      created_at_block: block.blockNumber,
      created_at_block_hash: block.hash,
      created_at_block_network: block.network,
      created_by_id: p.creator,
      start_time: Number(p.startTime),
      end_time: Number(p.endTime),
      space_id: spaceId,
      status: 'proposed',
    };

    proposalsToWrite.push(proposalToWrite);

    const proposedEditor: S.proposed_editors.Insertable = {
      id: p.proposalId,
      type: p.type,
      account_id: p.user,
      space_id: spaceId,
      created_at: p.startTime,
      created_at_block: block.blockNumber,
      created_at_block_hash: block.hash,
      created_at_block_network: block.network,
      proposal_id: p.proposalId,
    };

    proposedEditorsToWrite.push(proposedEditor);

    const newAccount: S.accounts.Insertable = {
      id: p.user,
    };

    accountsToWrite.push(newAccount);
  }

  return {
    proposals: proposalsToWrite,
    proposedEditors: proposedEditorsToWrite,
    accounts: accountsToWrite,
  };
}

function mapMembershipProposalsToSchema(
  proposals: MembershipProposal[],
  block: GeoBlock
): {
  proposals: S.proposals.Insertable[];
  proposedMembers: S.proposed_members.Insertable[];
  accounts: S.accounts.Insertable[];
} {
  const proposalsToWrite: S.proposals.Insertable[] = [];
  const proposedMembersToWrite: S.proposed_members.Insertable[] = [];
  const accountsToWrite: S.accounts.Insertable[] = [];

  for (const p of proposals) {
    const spaceId = p.space;

    const proposalToWrite: S.proposals.Insertable = {
      id: p.proposalId,
      onchain_proposal_id: p.onchainProposalId,
      plugin_address: p.pluginAddress,
      name: p.name,
      type: p.type,
      created_at: p.startTime,
      created_at_block: block.blockNumber,
      created_at_block_hash: block.hash,
      created_at_block_network: block.network,
      created_by_id: p.creator,
      start_time: Number(p.startTime),
      end_time: Number(p.endTime),
      space_id: spaceId,
      status: 'proposed',
    };

    proposalsToWrite.push(proposalToWrite);

    const proposedMember: S.proposed_members.Insertable = {
      id: p.proposalId,
      type: p.type,
      account_id: p.user,
      space_id: spaceId,
      created_at: p.startTime,
      created_at_block: block.blockNumber,
      created_at_block_hash: block.hash,
      created_at_block_network: block.network,
      proposal_id: p.proposalId,
    };

    proposedMembersToWrite.push(proposedMember);

    const newAccount: S.accounts.Insertable = {
      id: p.user,
    };

    accountsToWrite.push(newAccount);
  }

  return {
    proposals: proposalsToWrite,
    proposedMembers: proposedMembersToWrite,
    accounts: accountsToWrite,
  };
}

function mapSubspaceProposalsToSchema(
  proposals: SubspaceProposal[],
  block: GeoBlock
): {
  proposals: S.proposals.Insertable[];
  proposedSubspaces: S.proposed_subspaces.Insertable[];
} {
  const proposalsToWrite: S.proposals.Insertable[] = [];
  const proposedSubspacesToWrite: S.proposed_subspaces.Insertable[] = [];

  for (const p of proposals) {
    const spaceId = p.space;

    const proposalToWrite: S.proposals.Insertable = {
      id: p.proposalId,
      onchain_proposal_id: p.onchainProposalId,
      plugin_address: p.pluginAddress,
      name: p.name,
      type: p.type,
      created_at: p.startTime,
      created_at_block: block.blockNumber,
      created_at_block_hash: block.hash,
      created_at_block_network: block.network,
      created_by_id: p.creator,
      start_time: Number(p.startTime),
      end_time: Number(p.endTime),
      space_id: spaceId,
      status: 'proposed',
    };

    proposalsToWrite.push(proposalToWrite);

    const proposedSubspace: S.proposed_subspaces.Insertable = {
      id: p.proposalId,
      type: p.type,
      parent_space: p.space,
      subspace: p.subspace,
      created_at: p.startTime,
      created_at_block: block.blockNumber,
      created_at_block_hash: block.hash,
      created_at_block_network: block.network,
      proposal_id: p.proposalId,
    };

    proposedSubspacesToWrite.push(proposedSubspace);
  }

  return {
    proposals: proposalsToWrite,
    proposedSubspaces: proposedSubspacesToWrite,
  };
}

function mapEditProposalToSchema(
  proposals: EditProposal[],
  block: GeoBlock
): {
  proposals: S.proposals.Insertable[];
  proposedVersions: S.proposed_versions.Insertable[];
  ops: S.ops.Insertable[];
} {
  const proposalsToWrite: S.proposals.Insertable[] = [];
  const proposedVersionsToWrite: S.proposed_versions.Insertable[] = [];
  const opsToWrite: S.ops.Insertable[] = [];

  for (const p of proposals) {
    const spaceId = p.space;

    // An EditProposal is either created by a user publishing new edits, or by importing a set
    // of edits from a space on another blockchain. We want to keep the original edits' time
    // and block metadata as part of the import. For edits we read the original created metadata
    // if it exists, and if not, read from the current block of the active chain.
    const blockMetadata = getBlockMetadataForProposal(proposals, p.proposalId, block);

    const proposalToWrite: S.proposals.Insertable = {
      id: p.proposalId,
      onchain_proposal_id: p.onchainProposalId,
      plugin_address: p.pluginAddress,
      name: p.name,
      type: 'ADD_EDIT',
      created_at: blockMetadata.timestamp ?? p.startTime,
      created_at_block: blockMetadata.blockNumber,
      created_at_block_hash: blockMetadata.hash,
      created_at_block_network: blockMetadata.network,
      created_by_id: p.creator,
      start_time: Number(p.startTime),
      end_time: Number(p.endTime),
      space_id: spaceId,
      status: 'proposed',
      uri: p.metadataUri,
    };

    proposalsToWrite.push(proposalToWrite);

    // p.ops.forEach((op, index) => {
    //   const string_value =
    //     op.value.type === 'string' || op.value.type === 'image' || op.value.type === 'url' || op.value.type === 'date'
    //       ? op.value.value
    //       : null;
    //   const entity_value = op.value.type === 'entity' ? op.value.id : null;

    //   const proposed_version_id = generateVersionId({
    //     entryIndex: index,
    //     entityId: op.entityId,
    //     cursor: block.cursor,
    //   });

    //   const action_id = generateActionId({
    //     space_id: spaceId,
    //     entity_id: op.entityId,
    //     attribute_id: op.attributeId,
    //     value_id: op.value.id,
    //     cursor: block.cursor,
    //   });

    //   const mappedAction: S.actions.Insertable = {
    //     id: action_id,
    //     action_type: op.payload.type,
    //     entity_id: op.entityId,
    //     attribute_id: op.attributeId,
    //     value_type: op.value.type,
    //     value_id: op.value.id,
    //     string_value,
    //     entity_value_id: entity_value,
    //     proposed_version_id,
    //     created_at: Number(p.startTime),
    //     created_at_block: block.blockNumber,
    //   };

    //   return actionsToWrite.push(mappedAction);
    // });

    const uniqueEntityIds = new Set(p.ops.map(action => action.payload.entityId));

    // @TODO: These should read from the proposal metadata as well
    [...uniqueEntityIds.values()].forEach(entityId => {
      const mappedProposedVersion: S.proposed_versions.Insertable = {
        id: createVersionId({
          entityId,
          proposalId: p.proposalId,
        }),
        entity_id: entityId,
        created_at_block: block.blockNumber,
        created_at_block_hash: block.hash,
        created_at_block_network: block.network,
        created_at: p.startTime,
        created_by_id: p.creator,
        proposal_id: p.proposalId,
        space_id: spaceId,
      };

      proposedVersionsToWrite.push(mappedProposedVersion);
    });
  }

  return {
    proposals: proposalsToWrite,
    proposedVersions: proposedVersionsToWrite,
    ops: opsToWrite,
  };
}

export function mapIpfsProposalToSchemaProposalByType(
  proposals: (MembershipProposal | SubspaceProposal | EditorshipProposal | EditProposal)[],
  block: GeoBlock
) {
  const { subspaceProposals, memberProposals, editorProposals, editProposals } = groupProposalsByType(proposals);

  const schemaSubspaceProposals = mapSubspaceProposalsToSchema(subspaceProposals, block);
  const schemaMembershipProposals = mapMembershipProposalsToSchema(memberProposals, block);
  const schemaEditorshipProposals = mapEditorshipProposalsToSchema(editorProposals, block);
  const schemaEditProposals = mapEditProposalToSchema(editProposals, block);

  return {
    schemaSubspaceProposals,
    schemaMembershipProposals,
    schemaEditorshipProposals,
    schemaEditProposals,
  };
}

// An EditProposal is either created by a user publishing new edits, or by importing a set
// of edits from a space on another blockchain. We want to keep the original edits' time
// and block metadata as part of the import. For edits we read the original created metadata
// if it exists, and if not, read from the current block of the active chain.
function getBlockMetadataForProposal(proposals: EditProposal[], proposalId: string, block: GeoBlock) {
  const proposalForProposedVersion = proposals.find(p => p.proposalId === proposalId);
  const maybeImportedCreatedAtBlock = proposalForProposedVersion?.createdAtBlock;

  const timestamp = maybeImportedCreatedAtBlock?.timestamp ?? block.timestamp;
  const blockNumber = maybeImportedCreatedAtBlock?.blockNumber ?? block.blockNumber;
  const hash = maybeImportedCreatedAtBlock?.hash ?? block.hash;
  const network = maybeImportedCreatedAtBlock?.network ?? block.network;

  return {
    timestamp,
    blockNumber,
    hash,
    network,
  };
}
