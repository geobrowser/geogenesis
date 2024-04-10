import type {
  CreateTripleAction,
  DeleteTripleAction,
} from '@geogenesis/action-schema'

export type Action = CreateTripleAction | DeleteTripleAction

export type ContentProposalMetadata = {
  type: 'CONTENT'
  version: '1.0.0'
  actions: Action[]
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string
  name?: string
}

export type MembershipProposalMetadata = {
  type: 'ADD_MEMBER' | 'REMOVE_MEMBER' | 'ADD_EDITOR' | 'REMOVE_EDITOR'
  version: '1.0.0'
  userAddress: `0x${string}`
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string
  name?: string
}

export type SubspaceProposalMetadata = {
  type: 'ADD_SUBSPACE' | 'REMOVE_SUBSPACE'
  version: '1.0.0'
  subspace: `0x${string}`
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string
  name?: string
}

export type ProposalMetadata =
  | ContentProposalMetadata
  | MembershipProposalMetadata
  | SubspaceProposalMetadata

export type ProposalType = Uppercase<ProposalMetadata['type']>

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

export type ProposalStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELED'
  | 'EXECUTED'

export {
  getProcessGeoProposalArguments,
  getAcceptSubspaceArguments,
  getAcceptEditorArguments
} from './src/encodings'

export { createGeoId } from './src/id'
export { createContentProposal, createSubspaceProposal, createMembershipProposal } from './src/proposals'
