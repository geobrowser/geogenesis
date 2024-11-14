import { z } from 'zod';

import type { Op } from '~/sink/types';

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
export const ZodSubstreamProposalCreated = z.object({
  proposalId: z.string(),
  pluginAddress: z.string(),
  creator: z.string(),
  metadataUri: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

// This comes from the onchain event mapping in our rust bindings
export const ZodProposal = z.object({
  proposalId: z.string(),
  space: z.string(),
  creator: z.string(),
  metadataUri: z.string(),
  startTime: z.string(),
  endTime: z.string(),
});

// This comes from the IPFS contents posted onchain and emitted bu our
// onchain event mapping in our rust bindings.
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
  type: z.union([z.literal('ADD_MEMBER'), z.literal('REMOVE_MEMBER')]),
  name: z.string(),
  version: z.string(),
  id: z.string(),
  user: z.string(),
});

export type MembershipProposal = Proposal & {
  type: 'ADD_MEMBER' | 'REMOVE_MEMBER';
  name: string;
  proposalId: string;
  onchainProposalId: string;
  pluginAddress: string;
  user: `0x${string}`; // corresponds to a user's wallet address
};

export const ZodEditorshipProposal = z.object({
  type: z.union([z.literal('ADD_EDITOR'), z.literal('REMOVE_EDITOR')]),
  name: z.string(),
  version: z.string(),
  id: z.string(),
  user: z.string(),
});

export type EditorshipProposal = Proposal & {
  type: 'ADD_EDITOR' | 'REMOVE_EDITOR';
  name: string;
  proposalId: string;
  onchainProposalId: string;
  pluginAddress: string;
  user: `0x${string}`; // corresponds to a user's wallet address
};

export const ZodSubspaceProposal = z.object({
  type: z.union([z.literal('ADD_SUBSPACE'), z.literal('REMOVE_SUBSPACE')]),
  name: z.string(),
  version: z.string(),
  id: z.string(),
  subspace: z.string(),
});

export type SubspaceProposal = Proposal & {
  type: 'ADD_SUBSPACE' | 'REMOVE_SUBSPACE';
  name: string;
  proposalId: string;
  onchainProposalId: string;
  pluginAddress: string;
  subspace: string; // corresponds to the space id
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

const ZodEditSetTriplePayload = z.object({
  entity: z.string(),
  attribute: z.string(),

  /**
   * TEXT = 1;
   * NUMBER = 2;
   * ENTITY = 3;
   * URI = 4;
   * CHECKBOX = 5;
   * TIME = 6;
   * GEO_LOCATION = 7;
   */
  value: z.object({
    value: z.string(),
    type: z.union([
      z.literal('TEXT'),
      z.literal('NUMBER'),
      z.literal('ENTITY'),
      z.literal('URI'),
      z.literal('CHECKBOX'),
      z.literal('TIME'),
      z.literal('GEO_LOCATION'),
    ]),
  }),
});

const ZodEditDeleteTriplePayload = z.object({
  entity: z.string(),
  attribute: z.string(),
  // value: z.object({}),
});

const ZodSetTripleOp = z.object({
  type: z.literal('SET_TRIPLE'),
  triple: ZodEditSetTriplePayload,
});

const ZodDeleteTripleOp = z.object({
  type: z.literal('DELETE_TRIPLE'),
  triple: ZodEditDeleteTriplePayload,
});

export const ZodOp = z.union([ZodSetTripleOp, ZodDeleteTripleOp]);

export const ZodEdit = z.object({
  version: z.string(),
  type: z.literal('ADD_EDIT'),
  id: z.string(),
  name: z.string(),
  ops: z.array(ZodOp),
  authors: z.array(z.string()),
});

export type ParsedEdit = z.infer<typeof ZodEdit>;

export type EditProposal = Proposal & {
  type: 'ADD_EDIT';
  name: string;
  proposalId: string;
  onchainProposalId: string;
  pluginAddress: string;
  ops: Op[];
};

const ZodImportEditSetTriplePayload = z.object({
  entity: z.string(),
  attribute: z.string(),
  // zod has issues with discriminated unions. We set the value
  // to any here and trust that it is constructed into the correct
  // format once it's decoded.
  value: z.object({
    value: z.string(),
    /**
     * TEXT = 1;
     * NUMBER = 2;
     * ENTITY = 3;
     * URI = 4;
     * CHECKBOX = 5;
     * TIME = 6;
     * GEO_LOCATION = 7;
     */
    type: z.number().transform(t => {
      switch (t) {
        case 1:
          return 'TEXT';
        case 2:
          return 'NUMBER';
        case 3:
          return 'ENTITY';
        case 4:
          return 'URI';
        case 5:
          return 'CHECKBOX';
        case 6:
          return 'TIME';
        case 7:
          return 'GEO_LOCATION';
        default:
          return 'TEXT';
      }
    }),
  }),
});

const ZodImportEditDeleteTriplePayload = z.object({
  entity: z.string(),
  attribute: z.string(),
});

const ZodImportEditSetTripleOp = z.object({
  type: z.literal(1).transform(() => 'SET_TRIPLE'),
  triple: ZodImportEditSetTriplePayload,
});

const ZodImportEditDeleteTripleOp = z.object({
  type: z.literal(2).transform(() => 'DELETE_TRIPLE'),
  triple: ZodImportEditDeleteTriplePayload,
});

const ZodImportEditOp = z.union([ZodImportEditSetTripleOp, ZodImportEditDeleteTripleOp]);

export const ZodImportEdit = z.object({
  name: z.string(),
  version: z.string(),
  id: z.string(),
  ops: z.array(ZodImportEditOp),
  authors: z.array(z.string()),
  createdBy: z.string(),
  createdAt: z.string(),
});

export type ParsedImportEdit = z.infer<typeof ZodImportEdit>;
