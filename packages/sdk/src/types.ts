export type ValueType = 'TEXT' | 'NUMBER' | 'CHECKBOX' | 'URL' | 'TIME' | 'POINT';

export type Value = {
  type: ValueType;
  value: string;
};

/**
 * @see: Operations data spec is still WIP
 */
export type SetTripleOp = {
  type: 'SET_TRIPLE';
  triple: {
    entity: string;
    attribute: string;
    value: Value;
  };
};

/**
 * @see: Operations data spec is still WIP
 */
export type DeleteTripleOp = {
  type: 'DELETE_TRIPLE';
  triple: {
    entity: string;
    attribute: string;
  };
};

export type Op = SetTripleOp | DeleteTripleOp;

export type EditProposalMetadata = {
  type: 'ADD_EDIT';
  version: '0.0.1';
  name?: string;
  ops: Op[];
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  id: string;
  authors: string[];
};

export type MembershipProposalMetadata = {
  type: 'ADD_MEMBER' | 'REMOVE_MEMBER' | 'ADD_EDITOR' | 'REMOVE_EDITOR';
  version: '1.0.0';
  user: `0x${string}`;
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  id: string;
  name?: string;
};

export type SubspaceProposalMetadata = {
  type: 'ADD_SUBSPACE' | 'REMOVE_SUBSPACE';
  version: '1.0.0';
  subspace: `0x${string}`;
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  id: string;
  name?: string;
};

export type ProposalMetadata = EditProposalMetadata | MembershipProposalMetadata | SubspaceProposalMetadata;

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
