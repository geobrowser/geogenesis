import { z } from 'zod';

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
 * Spaces without governance also emit ProposalCreated events, but with an empty metadata field.
 * For now we don't create those proposals and instead manually create them based on the space
 * type or action type. i.e., if it's a personal space or a space that was created with a set
 * of data we create those proposals in a separate process.
 */
const ZodChainBaseProposalCreated = z.object({
  proposalId: z.string(),
  pluginAddress: z.string(),
  creator: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  daoAddress: z.string(),
});

export const ZodChainPublishEditProposal = ZodChainBaseProposalCreated.extend({ contentUri: z.string() });

export const ZodEditProposalCreatedStreamResponse = z.object({
  edits: z.array(ZodChainPublishEditProposal).min(1),
});

export const ZodAddMemberProposal = ZodChainBaseProposalCreated.extend({
  member: z.string(),
  changeType: z.string().superRefine(data => data === 'added'),
});

export const ZodAddMemberProposalStreamResponse = z.object({
  proposedMembers: z.array(ZodAddMemberProposal).min(1),
});

export const ZodRemoveMemberProposal = ZodChainBaseProposalCreated.extend({
  member: z.string(),
  changeType: z.string().superRefine(data => data === 'removed'),
});

export const ZodRemoveMemberProposalStreamResponse = z.object({
  proposedMembers: z.array(ZodRemoveMemberProposal).min(1),
});

export const ZodAddEditorProposal = ZodChainBaseProposalCreated.extend({
  editor: z.string(),
  changeType: z.string().superRefine(data => data === 'added'),
});

export const ZodAddEditorProposalStreamResponse = z.object({
  proposedEditors: z.array(ZodAddEditorProposal).min(1),
});

export const ZodRemoveEditorProposal = ZodChainBaseProposalCreated.extend({
  editor: z.string(),
  changeType: z.string().superRefine(data => data === 'removed'),
});

export const ZodRemoveEditorProposalStreamResponse = z.object({
  proposedEditors: z.array(ZodRemoveEditorProposal).min(1),
});

export const ZodAddSubspaceProposal = ZodChainBaseProposalCreated.extend({
  subspace: z.string(),
  changeType: z.string().superRefine(data => data === 'added'),
});

export const ZodAddSubspaceProposalStreamResponse = z.object({
  proposedSubspaces: z.array(ZodAddSubspaceProposal).min(1),
});

export const ZodRemoveSubspaceProposal = ZodChainBaseProposalCreated.extend({
  subspace: z.string(),
  changeType: z.string().superRefine(data => data === 'removed'),
});

export const ZodRemoveSubspaceProposalStreamResponse = z.object({
  proposedSubspaces: z.array(ZodRemoveSubspaceProposal).min(1),
});

export type ChainProposal = z.infer<typeof ZodChainBaseProposalCreated>;
export type ChainEditProposal = z.infer<typeof ZodChainPublishEditProposal>;
export type ChainAddMemberProposal = z.infer<typeof ZodAddMemberProposal>;
export type ChainRemoveMemberProposal = z.infer<typeof ZodRemoveMemberProposal>;
export type ChainAddEditorProposal = z.infer<typeof ZodAddEditorProposal>;
export type ChainRemoveEditorProposal = z.infer<typeof ZodRemoveEditorProposal>;
export type ChainAddSubspaceProposal = z.infer<typeof ZodAddSubspaceProposal>;
export type ChainRemoveSubspaceProposal = z.infer<typeof ZodRemoveSubspaceProposal>;
