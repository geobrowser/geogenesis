import type {
  CreateTripleAction,
  DeleteTripleAction,
} from '@geogenesis/action-schema'

export type Action = CreateTripleAction | DeleteTripleAction

export type ContentProposalMetadata = {
  type: 'content'
  version: '1.0.0'
  actions: Action[]
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string
  name?: string
}

export type MembershipProposalMetadata = {
  type: 'add_member' | 'remove_member' | 'add_editor' | 'remove_editor'
  version: '1.0.0'
  userAddress: `0x${string}`
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  proposalId: string
  name?: string
}

export type SubspaceProposalMetadata = {
  type: 'add_subspace' | 'remove_subspace'
  version: '1.0.0'
  subspace: `0x${string}`
  proposalId: string
  // We generate the proposal id on the client so we can pass it to the proposal
  // execution callback passed to a proposal.
  name?: string
}

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
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELED'
  | 'EXECUTED'

export {
  getProcessGeoProposalArguments,
  getAcceptSubspaceArguments,
} from './src/encodings'

export { createGeoId } from './src/id'
export { createContentProposal } from './src/proposal'
