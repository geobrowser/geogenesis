import { z } from 'zod';

import { type Action, ZodAction } from '../../zod';

/**
 * Proposals represent a proposal to change the state of a DAO-based space. Proposals can
 * represent changes to content, membership (editor or member), governance changes, subspace
 * membership, or anything else that can be executed by a DAO.
 *
 * Currently we use a simple majority voting model, where a proposal requires 51% of the
 * available votes in order to pass. Only editors are allowed to vote on proposals, but editors
 * _and_ members can create them.
 *
 * Proposals require encoding a "callback" that represents the action to be taken if the proposal
 * succeeds. For example, if a proposal is to add a new editor to the space, the callback would
 * be the encoded function call to add the editor to the space.
 *
 * ```ts
 * {
 *   to: `0x123...`, // The address of the membership contract
 *   data: `0x123...`, // The encoded function call parameters
 * }
 * ```
 */
export const ZodSubstreamProposalCreated = z.object({
  proposalId: z.string(),
  pluginAddress: z.string(),
  creator: z.string(),
  metadataUri: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

export const ZodProposal = z.object({
  proposalId: z.string(),
  space: z.string(),
  creator: z.string(),
  metadataUri: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

// DAO-based spaces can have different proposal types. We need to be able
// to parse the proposal type in order to validate the contents of the
// proposal and write to the sink correctly.
export const ZodProposalMetadata = z.object({
  type: z.enum([
    'CONTENT',
    'ADD_SUBSPACE',
    'REMOVE_SUBSPACE',
    'ADD_EDITOR',
    'REMOVE_EDITOR',
    'ADD_MEMBER',
    'REMOVE_MEMBER',
  ]),
  name: z.string().optional(),
  // We version the data structured used to represent proposal metadata. Each
  // proposal type has their own metadata and versioning that we can change
  // independently of other proposal types.
  version: z.string(),
});

export type ProposalMetadata = z.infer<typeof ZodProposalMetadata>;

export type ProposalCreated = z.infer<typeof ZodSubstreamProposalCreated>;
export type Proposal = z.infer<typeof ZodProposal>;

export const ZodContentProposal = z.object({
  proposalId: z.string(),
  actions: z.array(ZodAction),
});

export type ContentProposal = Proposal & {
  type: 'CONTENT';
  name: string | null;
  proposalId: string;
  onchainProposalId: string;
  actions: Action[];
  // uri: string;
  // json: string;
};

export const ZodMembershipProposal = z.object({
  proposalId: z.string(),
  userAddress: z.string(),
});

export type MembershipProposal = Proposal & {
  type: 'ADD_MEMBER' | 'REMOVE_MEMBER';
  name: string | null;
  proposalId: string;
  onchainProposalId: string;
  userAddress: `0x${string}`;
  // uri: string;
  // json: string;
};

export const ZodEditorshipProposal = z.object({
  proposalId: z.string(),
  editorAddress: z.string(),
});

export type EditorshipProposal = Proposal & {
  type: 'ADD_EDITOR' | 'REMOVE_EDITOR';
  name: string | null;
  proposalId: string;
  onchainProposalId: string;
  userAddress: `0x${string}`;
  // uri: string;
  // json: string;
};

export const ZodSubspaceProposal = z.object({
  proposalId: z.string(),
  subspace: z.string(),
});

export type SubspaceProposal = Proposal & {
  type: 'ADD_SUBSPACE' | 'REMOVE_SUBSPACE';
  name: string | null;
  proposalId: string;
  onchainProposalId: string;
  subspace: `0x${string}`;
  // uri: string;
  // json: string;
};

export const ZodProposalCreatedStreamResponse = z.object({
  proposalsCreated: z.array(ZodSubstreamProposalCreated).min(1),
});

export const ZodProposalProcessed = z.object({
  contentUri: z.string(),
  pluginAddress: z.string(),
});

export type ProposalProcessed = z.infer<typeof ZodProposalProcessed>;

export const ZodProposalProcessedStreamResponse = z.object({
  proposalsProcessed: z.array(ZodProposalProcessed).min(1),
});