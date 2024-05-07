import type { CreateTripleAction, DeleteTripleAction } from '@geogenesis/action-schema';

export type StringValue = {
  id: string;
  type: 'string';
  value: string;
};

export type EntityValue = {
  id: string;
  type: 'entity';
  value: string; // uuid
};

export type CollectionValue = {
  id: string;
  type: 'collection';
  value: string; // uuid
};

export type Value = StringValue | EntityValue | CollectionValue;

/**
 * @see: Operations data spec is still WIP
 */
export type UpsertTripleOperation = {
  op: 'upsertTriple';
  spaceId: string;
  entityId: string;
  attributeId: string;
  value: Value;
};

/**
 * @see: Operations data spec is still WIP
 */
export type DeleteTripleOperation = {
  op: 'upsertTriple';
  spaceId: string;
  entityId: string;
  attributeId: string;
  // Delete operations don't need a value since there can only be one (spaceId, entityId, attributeId) tuple combination
};

/**
 * @deprecated Use operations instead of actions
 */
export type Action = CreateTripleAction | DeleteTripleAction;

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
export { createContentProposal, createSubspaceProposal, createMembershipProposal } from './src/proposals';
