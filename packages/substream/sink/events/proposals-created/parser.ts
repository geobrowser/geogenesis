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
    'EDIT',
    'ADD_SUBSPACE',
    'REMOVE_SUBSPACE',
    'ADD_EDITOR',
    'REMOVE_EDITOR',
    'ADD_MEMBER',
    'REMOVE_MEMBER',
  ]),
  name: z.string(),
  // We version the data structured used to represent proposal metadata. Each
  // proposal type has their own metadata and versioning that we can change
  // independently of other proposal types.
  version: z.string(),
});

export type ProposalMetadata = z.infer<typeof ZodProposalMetadata>;

export type ProposalCreated = z.infer<typeof ZodSubstreamProposalCreated>;
export type Proposal = z.infer<typeof ZodProposal>;

export const ZodMembershipProposal = z.object({
  proposalId: z.string(),
  userAddress: z.string(),
});

export type MembershipProposal = Proposal & {
  type: 'ADD_MEMBER' | 'REMOVE_MEMBER';
  name: string;
  proposalId: string;
  onchainProposalId: string;
  pluginAddress: string;
  userAddress: `0x${string}`;
};

export const ZodEditorshipProposal = z.object({
  proposalId: z.string(),
  editorAddress: z.string(),
});

export type EditorshipProposal = Proposal & {
  type: 'ADD_EDITOR' | 'REMOVE_EDITOR';
  name: string;
  proposalId: string;
  onchainProposalId: string;
  pluginAddress: string;
  userAddress: `0x${string}`;
};

export const ZodSubspaceProposal = z.object({
  proposalId: z.string(),
  subspace: z.string(),
});

export type SubspaceProposal = Proposal & {
  type: 'ADD_SUBSPACE' | 'REMOVE_SUBSPACE';
  name: string;
  proposalId: string;
  onchainProposalId: string;
  pluginAddress: string;
  subspace: `0x${string}`;
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

const ZodEditValueType = z.union([
  z.literal('TEXT'),
  z.literal('NUMBER'),
  z.literal('ENTITY'),
  z.literal('COLLECTION'),
  z.literal('CHECKBOX'),
  z.literal('URL'),
  z.literal('TIME'),
  z.literal('GEO_LOCATION'),
]);

const ZodEditValue = z.object({
  type: ZodEditValueType,
  value: z.string(),
});

const ZodEditSetTriplePayload = z.object({
  entityId: z.string(),
  attributeId: z.string(),
  // @TODO: idk why this is broken
  // value: ZodEditValue,
  value: z.any(),
});

const ZodEditDeleteTriplePayload = z.object({
  entityId: z.string(),
  attributeId: z.string(),
  // @TODO: idk why this is broken
  // value: z.object({})
  value: z.any(),
});

const ZodSetTripleOp = z.object({
  opType: z.literal('SET_TRIPLE'),
  payload: ZodEditSetTriplePayload,
});

const ZodDeleteTripleOp = z.object({
  opType: z.literal('DELETE_TRIPLE'),
  payload: ZodEditDeleteTriplePayload,
});

export const ZodOp = z.discriminatedUnion('opType', [ZodSetTripleOp, ZodDeleteTripleOp]);

export type Op = z.infer<typeof ZodOp>;

export const ZodEdit = z.object({
  name: z.string(),
  version: z.string(),
  ops: z.array(ZodOp),
  authors: z.array(z.string()),
  id: z.string(),
});

export type Edit = z.infer<typeof ZodEdit>;

export type EditProposal = Proposal & {
  type: 'EDIT';
  name: string;
  proposalId: string;
  onchainProposalId: string;
  pluginAddress: string;
  ops: Op[];
};
