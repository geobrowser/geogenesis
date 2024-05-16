import type { CreateTripleAction, DeleteTripleAction } from './legacy';

export type ValueType = 'TEXT' | 'NUMBER' | 'ENTITY' | 'COLLECTION' | 'CHECKBOX' | 'URL' | 'TIME' | 'GEO_LOCATION';

export type Value = {
  type: ValueType;
  value: string;
};

/**
 * @see: Operations data spec is still WIP
 */
export type SetTripleOp = {
  op: 'SET_TRIPLE';
  payload: {
    entityId: string;
    attributeId: string;
    value: Value;
  };
};

/**
 * @see: Operations data spec is still WIP
 */
export type DeleteTripleOp = {
  op: 'DELETE_TRIPLE';
  payload: {
    entityId: string;
    attributeId: string;
    // Delete operations don't need a value since there can only be one (spaceId, entityId, attributeId) tuple combination
  };
};

/**
 * @deprecated Use operations instead of actions
 */
export type Action = CreateTripleAction | DeleteTripleAction;

export type EditProposalMetadata = {
  type: 'EDIT';
  version: '0.0.1';
  name?: string;
  ops: Op[];
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string;
  authors: string[];
};

export type Op =
  | SetTripleOp
  | DeleteTripleOp

export type ContentProposalMetadata = {
  type: 'CONTENT';
  version: '1.0.0';
  actions: Action[];
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string;
  name?: string;
};

export type MembershipProposalMetadata = {
  type: 'ADD_MEMBER' | 'REMOVE_MEMBER' | 'ADD_EDITOR' | 'REMOVE_EDITOR';
  version: '1.0.0';
  userAddress: `0x${string}`;
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string;
  name?: string;
};

export type SubspaceProposalMetadata = {
  type: 'ADD_SUBSPACE' | 'REMOVE_SUBSPACE';
  version: '1.0.0';
  subspace: `0x${string}`;
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string;
  name?: string;
};

export type ProposalMetadata = ContentProposalMetadata | MembershipProposalMetadata | SubspaceProposalMetadata;

export type ProposalType = Uppercase<ProposalMetadata['type']>;

export enum VoteOption {
  None = 0,
  Abstain = 1,
  Yes = 2,
  No = 3,
}

export enum VotingMode {
  Standard = 0,
  EarlyExecution = 1,
}

export type ProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'CANCELED' | 'EXECUTED';

export { createGeoId, createTripleId } from './src/id';
export { getProcessGeoProposalArguments, getAcceptSubspaceArguments, getAcceptEditorArguments, getRemoveEditorArguments, getRemoveSubspaceArguments } from './src/encodings';
export { createCollection, createCollectionItem, reorderCollectionItem } from './src/collections';
export { createContentProposal, createSubspaceProposal, createMembershipProposal, createEditProposal } from './src/proposals';
