import { GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';
import type * as S from 'zapatos/schema';

import { createVersionId } from '../../utils/id';
import type {
  BlockEvent,
  CreateRelationOp,
  DeleteRelationOp,
  DeleteTripleOp,
  SetTripleOp,
  SinkEditProposal,
  SinkEditorshipProposal,
  SinkMembershipProposal,
  SinkSubspaceProposal,
} from '~/sink/types';

function groupProposalsByType(
  proposals: (SinkMembershipProposal | SinkSubspaceProposal | SinkEditorshipProposal | SinkEditProposal)[]
): {
  memberProposals: SinkMembershipProposal[];
  editorProposals: SinkEditorshipProposal[];
  subspaceProposals: SinkSubspaceProposal[];
  editProposals: SinkEditProposal[];
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
  proposals: SinkEditorshipProposal[],
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
      account_id: p.editor,
      space_id: spaceId,
      created_at: Number(p.startTime),
      created_at_block: block.blockNumber,
      proposal_id: p.proposalId,
    };

    proposedEditorsToWrite.push(proposedEditor);

    const newAccount: S.accounts.Insertable = {
      id: p.editor,
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
  proposals: SinkMembershipProposal[],
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
      account_id: p.member,
      space_id: spaceId,
      created_at: Number(p.startTime),
      created_at_block: block.blockNumber,
      proposal_id: p.proposalId,
    };

    proposedMembersToWrite.push(proposedMember);

    const newAccount: S.accounts.Insertable = {
      id: p.member,
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
  proposals: SinkSubspaceProposal[],
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
  proposals: SinkEditProposal[],
  block: BlockEvent
): {
  proposals: S.proposals.Insertable[];
  versions: S.versions.Insertable[];
  edits: S.edits.Insertable[];
  relationOpsByEditId: Map<string, (CreateRelationOp | DeleteRelationOp)[]>;
  tripleOpsByVersionId: Map<string, (SetTripleOp | DeleteTripleOp)[]>;
} {
  const proposalsToWrite: S.proposals.Insertable[] = [];
  const versionsToWrite: S.versions.Insertable[] = [];
  const editsToWrite: S.edits.Insertable[] = [];
  const relationOpsByEditId = new Map<string, (CreateRelationOp | DeleteRelationOp)[]>();
  const tripleOpsByVersionId = new Map<string, (SetTripleOp | DeleteTripleOp)[]>();

  for (const p of proposals) {
    const spaceId = p.space;

    editsToWrite.push({
      id: p.proposalId,
      name: p.name,
      description: null,
      uri: p.contentUri,
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

    const uniqueEntityIds = new Set(
      p.ops.map(op => {
        switch (op.type) {
          case 'CREATE_RELATION':
          case 'DELETE_RELATION':
            return op.relation.id;
          case 'SET_TRIPLE':
          case 'DELETE_TRIPLE':
            return op.triple.entity;
        }
      })
    );

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

      const opsForEntityId = p.ops
        .filter(o => o.type === 'SET_TRIPLE' || o.type === 'DELETE_TRIPLE')
        .filter(o => o.triple.entity === entityId);

      const opsForEntityIdWhereRelation = p.ops
        .filter(o => o.type === 'CREATE_RELATION' || o.type === 'DELETE_RELATION')
        .filter(o => o.relation.id === entityId);

      // Creating and deleting relations is done via the CREATE_RELATION or DELETE_RELATION op types.
      // Here we map these op types into triple ops in order to write the triples to the db. This allows
      // us to write the ops for each relation as if they are entities while also performing any side-effects
      // related to the relations themselves by still using the CREATE_RELATION and DELETE_RELATION op types.
      tripleOpsByVersionId.set(id, [...opsForEntityId, ...opsForEntityIdWhereRelation.flatMap(relationOpToTripleOps)]);
    }

    relationOpsByEditId.set(
      p.proposalId,
      p.ops.filter(o => o.type === 'CREATE_RELATION' || o.type === 'DELETE_RELATION')
    );
  }

  return {
    proposals: proposalsToWrite,
    versions: versionsToWrite,
    edits: editsToWrite,
    tripleOpsByVersionId,
    relationOpsByEditId,
  };
}

export function mapIpfsProposalToSchemaProposalByType(
  proposals: (SinkMembershipProposal | SinkSubspaceProposal | SinkEditorshipProposal | SinkEditProposal)[],
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

function relationOpToTripleOps(op: CreateRelationOp | DeleteRelationOp): (SetTripleOp | DeleteTripleOp)[] {
  if (op.type === 'CREATE_RELATION') {
    return [
      {
        type: 'SET_TRIPLE',
        space: op.space,
        triple: {
          entity: op.relation.id,
          attribute: SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
          value: {
            type: 'URL',
            value: GraphUrl.fromEntityId(op.relation.type),
          },
        },
      },
      {
        type: 'SET_TRIPLE',
        space: op.space,
        triple: {
          entity: op.relation.id,
          attribute: SYSTEM_IDS.TYPES_ATTRIBUTE,
          value: {
            type: 'URL',
            value: GraphUrl.fromEntityId(SYSTEM_IDS.RELATION_TYPE),
          },
        },
      },
      {
        type: 'SET_TRIPLE',
        space: op.space,
        triple: {
          entity: op.relation.id,
          attribute: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
          value: {
            type: 'URL',
            value: GraphUrl.fromEntityId(op.relation.fromEntity),
          },
        },
      },
      {
        type: 'SET_TRIPLE',
        space: op.space,
        triple: {
          entity: op.relation.id,
          attribute: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
          value: {
            type: 'URL',
            value: GraphUrl.fromEntityId(op.relation.toEntity),
          },
        },
      },
      {
        type: 'SET_TRIPLE',
        space: op.space,
        triple: {
          entity: op.relation.id,
          attribute: SYSTEM_IDS.RELATION_INDEX,
          value: {
            type: 'TEXT',
            value: op.relation.index,
          },
        },
      },
    ];
  }

  return [
    {
      type: 'DELETE_TRIPLE',
      space: op.space,
      triple: {
        entity: op.relation.id,
        attribute: SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
        value: {},
      },
    },
    {
      type: 'DELETE_TRIPLE',
      space: op.space,
      triple: {
        entity: op.relation.id,
        attribute: SYSTEM_IDS.TYPES_ATTRIBUTE,
        value: {},
      },
    },
    {
      type: 'DELETE_TRIPLE',
      space: op.space,
      triple: {
        entity: op.relation.id,
        attribute: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
        value: {},
      },
    },
    {
      type: 'DELETE_TRIPLE',
      space: op.space,
      triple: {
        entity: op.relation.id,
        attribute: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
        value: {},
      },
    },
    {
      type: 'DELETE_TRIPLE',
      space: op.space,
      triple: {
        entity: op.relation.id,
        attribute: SYSTEM_IDS.RELATION_INDEX,
        value: {},
      },
    },
  ];
}
