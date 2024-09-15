import type * as S from 'zapatos/schema';

import { createVersionId } from '../../utils/id';
import type { EditProposal, EditorshipProposal, MembershipProposal, SubspaceProposal } from './parser';
import type { BlockEvent, Op } from '~/sink/types';

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
  block: BlockEvent
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
      type: p.type,
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
      created_at: Number(p.startTime),
      created_at_block: block.blockNumber,
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
  block: BlockEvent
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
      type: p.type,
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
      created_at: Number(p.startTime),
      created_at_block: block.blockNumber,
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
  block: BlockEvent
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
      type: p.type,
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
      created_at: Number(p.startTime),
      created_at_block: block.blockNumber,
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
  block: BlockEvent
): {
  proposals: S.proposals.Insertable[];
  versions: S.versions.Insertable[];
  edits: S.edits.Insertable[];
  opsByVersionId: Map<string, Op[]>;
} {
  const proposalsToWrite: S.proposals.Insertable[] = [];
  const versionsToWrite: S.versions.Insertable[] = [];
  const editsToWrite: S.edits.Insertable[] = [];
  const opsByVersionId = new Map<string, Op[]>();

  for (const p of proposals) {
    const spaceId = p.space;

    editsToWrite.push({
      id: p.proposalId,
      name: p.name,
      description: null,
      uri: p.metadataUri,
      created_at_block: block.blockNumber.toString(),
      created_at: Number(p.startTime),
      created_by_id: p.creator,
      space_id: spaceId,
    } satisfies S.edits.Insertable);

    proposalsToWrite.push({
      id: p.proposalId,
      onchain_proposal_id: p.onchainProposalId,
      plugin_address: p.pluginAddress,
      type: 'ADD_EDIT',
      created_by_id: p.creator,
      start_time: Number(p.startTime),
      end_time: Number(p.endTime),
      edit_id: p.proposalId,
      space_id: spaceId,
      status: 'proposed',
    } satisfies S.proposals.Insertable);

    const uniqueEntityIds = new Set(p.ops.map(op => op.triple.entity));

    for (const entityId of [...uniqueEntityIds.values()]) {
      // For now we use a deterministic version for the proposed version id
      // so we can easily derive it for the op -> proposed version mapping.
      const id = createVersionId({
        entityId,
        proposalId: p.proposalId,
      });

      versionsToWrite.push({
        id,
        entity_id: entityId,
        created_at_block: block.blockNumber,
        created_at: Number(p.startTime),
        created_by_id: p.creator,
        edit_id: p.proposalId,
      } satisfies S.versions.Insertable);

      const opsForEntityId = p.ops.filter(o => o.triple.entity === entityId);
      opsByVersionId.set(id, opsForEntityId);
    }
  }

  return {
    proposals: proposalsToWrite,
    versions: versionsToWrite,
    edits: editsToWrite,
    opsByVersionId,
  };
}

export function mapIpfsProposalToSchemaProposalByType(
  proposals: (MembershipProposal | SubspaceProposal | EditorshipProposal | EditProposal)[],
  block: BlockEvent
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
