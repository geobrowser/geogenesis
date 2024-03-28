import { z } from 'zod';

import type { OmitStrict } from './types';

// An entry comes from an event on the blockchain. This is
// defined in our substream schema.
// https://github.com/MercuricChloride/geo-substream/blob/master/proto/schema.proto
export const ZodEntry = z.object({
  id: z.string(),
  index: z.string(),
  uri: z.string(),
  author: z.string(), // Map to a correctly encoded hex string
  space: z.string(), // Map to a correctly encoded hex string
});

export const ZodEntryStreamResponse = z.object({
  entries: z.array(ZodEntry).min(1),
});

export type Entry = z.infer<typeof ZodEntry>;

export const ZodAction = z.object({
  type: z.enum(['createTriple', 'deleteTriple']),
  entityId: z.string().refine(data => data !== '', {
    message: 'Entity id cannot be an empty string',
  }),
  attributeId: z.string().refine(data => data !== '', {
    message: 'Attribute id cannot be an empty string',
  }),
  entityName: z.string().nullish(),
  // @TODO: Value should be a union of objects
  value: z
    .object({
      type: z.enum(['number', 'string', 'entity', 'image', 'date', 'url']),
      id: z.string(),
      value: z.string().nullish(),
    })
    .refine(data => data.id || data.value, {
      message: 'Either id or value must be provided',
    }),
  // @TODO: Validate value type union for each value type
});

export type Action = z.infer<typeof ZodAction>;

export const ZodUriData = z.object({
  name: z.string().optional(),
  type: z.string(),
  version: z.string(),
  // We filter valid actions later one-by-one. We avoid filtering all actions
  // here as it would invalidate the entire array of actions instead of granularly.
  // @TODO: Is there a way to validate the entire array and filter invalid actions?
  actions: z.array(z.any()),
});

export type UriData = z.infer<typeof ZodUriData>;

export const ZodFullEntry = ZodEntry.extend({
  uriData: ZodUriData,
});

export interface FullEntry extends z.infer<typeof ZodFullEntry> {
  // Set the real Action type. We only use z.any() in ZodUriData to avoid
  // rejecting the entire array of actions if one of them is invalid.
  uriData: OmitStrict<UriData, 'actions'> & { actions: Action[] };
  // json: string;
  // uri: string;
}

/** Onchain Profile registrations */
export const ZodOnchainProfileRegistered = z.object({
  requestor: z.string(),
  space: z.string(),
  id: z.string(),
});

export type OnchainProfileRegistered = z.infer<typeof ZodOnchainProfileRegistered>;

export const ZodOnchainProfilesRegisteredStreamResponse = z.object({
  profilesRegistered: z.array(ZodOnchainProfileRegistered).min(1),
});

/** Creating a space plugin on a DAO */
export const ZodSpacePluginCreated = z.object({
  daoAddress: z.string(),
  spaceAddress: z.string(),
});

export type SpacePluginCreated = z.infer<typeof ZodSpacePluginCreated>;

export const ZodSpacePluginCreatedStreamResponse = z.object({
  spacesCreated: z.array(ZodSpacePluginCreated).min(1),
});

/** Creating governance plugins on a DAO */
export const ZodGovernancePluginsCreated = z.object({
  daoAddress: z.string(),
  mainVotingAddress: z.string(),
  memberAccessAddress: z.string(),
});

export type GovernancePluginsCreated = z.infer<typeof ZodGovernancePluginsCreated>;

export const ZodGovernancePluginsCreatedStreamResponse = z.object({
  governancePluginsCreated: z.array(ZodGovernancePluginsCreated).min(1),
});

/**
 * Adding editors represents granting the editor permission to users in a DAO-based space.
 *
 * The data model for DAO-based spaces works slightly differently than in legacy spaces.
 * This means there will be a period where we need to support both data models depending
 * on which space/contract we are working with. Eventually these data models will be merged
 * and usage of the legacy space contracts will be migrated to the DAO-based contracts, but
 * for now we are appending "V2" to permissions data models to denote it's used for the
 * DAO-based spaces.
 *
 * An editor has editing and voting permissions in a DAO-based space. Editors join a space
 * one of two ways:
 * 1. They submit a request to join the space as an editor which goes to a vote. The editors
 *    in the space vote on whether to accept the new editor.
 * 2. They are added as a set of initial editors when first creating the space. This allows
 *    space deployers to bootstrap a set of editors on space creation.
 */
export const ZodEditorsAdded = z.object({
  addresses: z.array(z.string()),
  pluginAddress: z.string(),
});

export type EditorsAdded = z.infer<typeof ZodEditorsAdded>;

export const ZodEditorsAddedStreamResponse = z.object({
  editorsAdded: z.array(ZodEditorsAdded).min(1),
});

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
export const ZodSubstreamProposal = z.object({
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
    'content',
    'add_subspace',
    'remove_subspace',
    'add_editor',
    'remove_editor',
    'add_member',
    'remove_member',
  ]),
  name: z.string().optional(),
  // We version the data structured used to represent proposal metadata. Each
  // proposal type has their own metadata and versioning that we can change
  // independently of other proposal types.
  version: z.string(),
});

export type ProposalMetadata = z.infer<typeof ZodProposalMetadata>;

export type SubstreamProposal = z.infer<typeof ZodSubstreamProposal>;
export type Proposal = z.infer<typeof ZodProposal>;

export const ZodContentProposal = z.object({
  proposalId: z.string(),
  actions: z.array(ZodAction),
});

export type ContentProposal = Proposal & {
  type: 'content';
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
  type: 'add_member' | 'remove_member' | 'add_editor' | 'remove_editor';
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
  type: 'add_subspace' | 'remove_subspace';
  name: string | null;
  proposalId: string;
  onchainProposalId: string;
  subspace: `0x${string}`;
  // uri: string;
  // json: string;
};

export const ZodProposalStreamResponse = z.object({
  proposalsCreated: z.array(ZodSubstreamProposal).min(1),
});

export const ZodProposalProcessed = z.object({
  contentUri: z.string(),
  pluginAddress: z.string(),
});

export type ProposalProcessed = z.infer<typeof ZodProposalProcessed>;

export const ZodProposalProcessedStreamResponse = z.object({
  proposalsProcessed: z.array(ZodProposalProcessed).min(1),
});

/**
 * Votes represent a vote on a proposal in a DAO-based space.
 *
 * Currently we use a simple majority voting model, where a proposal requires 51% of the
 * available votes in order to pass. Only editors are allowed to vote on proposals, but editors
 * _and_ members can create them.
 */
export const ZodVote = z.object({
  onchainProposalId: z.string(),
  voter: z.string(),
  voteOption: z.string(), // corresponds to VoteOption enum
  pluginAddress: z.string(),
});

export type Vote = z.infer<typeof ZodVote>;

export const ZodVotesCastStreamResponse = z.object({
  votesCast: z.array(ZodVote).min(1),
});

/**
 * Added or Removed Subspaces represent adding a space contracto to the hierarchy
 * of the DAO-based space. This is useful to "link" Spaces together in a
 * tree of spaces, allowing us to curate the graph of their knowledge and
 * permissions.
 */
export const ZodSubspaceAdded = z.object({
  subspace: z.string(),
  pluginAddress: z.string(),
  // We add the type to the changeType to ensure we can validate the data
  // independently of a subspace removal. Otherwise we'll parse both
  // events as if they are the same.
  changeType: z.string().refine(data => data === 'added'),
});

export const ZodSubspaceRemoved = z.object({
  subspace: z.string(),
  pluginAddress: z.string(),
  // We add the type to the changeType to ensure we can validate the data
  // independently of a subspace removal. Otherwise we'll parse both
  // events as if they are the same.
  changeType: z.string().refine(data => data === 'removed'),
});

export type SubspaceAdded = z.infer<typeof ZodSubspaceAdded>;
export type SubspaceRemoved = z.infer<typeof ZodSubspaceRemoved>;

export const ZodSubspacesAddedStreamResponse = z.object({
  subspacesAdded: z.array(ZodSubspaceAdded).min(1),
});

export const ZodSubspacesRemovedStreamResponse = z.object({
  subspacesRemoved: z.array(ZodSubspaceRemoved).min(1),
});

/**
 * Roles changes represent permission changes in a legacy space.
 *
 * The data model for DAO-based spaces works slightly differently than in legacy spaces.
 * This means there will be a period where we need to support both data models depending
 * on which space/contract we are working with. Eventually these data models will be merged
 * and usage of the legacy space contracts will be migrated to the DAO-based contracts, but
 * for now we are appending "V2" to permissions data models to denote it's used for the
 * DAO-based spaces.
 */
export const ZodRoleChange = z.object({
  id: z.string(),
  role: z.enum(['ADMIN', 'MEMBER', 'MODERATOR']),
  account: z.string(),
  sender: z.string(),
  space: z.string(),
});

export type RoleChange = z.infer<typeof ZodRoleChange>;

export const ZodRoleChangeStreamResponse = z.object({
  roleChanges: z
    .array(
      z
        .object({
          granted: ZodRoleChange.optional(),
          revoked: ZodRoleChange.optional(),
        })
        .refine(data => (data.granted ? !data.revoked : data.revoked), {
          message: 'Only one of granted or revoked must be provided',
        })
    )
    .min(1),
});
