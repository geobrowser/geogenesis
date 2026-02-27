/**
 * Shared Effect Schema definitions for proposal-related API responses.
 *
 * These schemas define the contract between the frontend and the gaia API.
 * All proposal fetch functions should import from here to ensure consistency.
 */
import { Schema } from 'effect';

import { ProposalStatus, ProposalType } from '../../substream-schema';

// ============================================================================
// Vote Schemas
// ============================================================================

/**
 * API vote option values.
 */
export const ApiVoteOptionSchema = Schema.Union(Schema.Literal('YES'), Schema.Literal('NO'), Schema.Literal('ABSTAIN'));

export type ApiVoteOption = Schema.Schema.Type<typeof ApiVoteOptionSchema>;

/**
 * Individual vote record from the API.
 */
export const ApiVoteSchema = Schema.Struct({
  voterId: Schema.String,
  vote: ApiVoteOptionSchema,
});

export type ApiVote = Schema.Schema.Type<typeof ApiVoteSchema>;

// ============================================================================
// Action Schemas
// ============================================================================

/**
 * Proposal action types supported by the API.
 */
export const ApiActionTypeSchema = Schema.Union(
  Schema.Literal('ADD_MEMBER'),
  Schema.Literal('REMOVE_MEMBER'),
  Schema.Literal('ADD_EDITOR'),
  Schema.Literal('REMOVE_EDITOR'),
  Schema.Literal('UNFLAG_EDITOR'),
  Schema.Literal('PUBLISH'),
  Schema.Literal('FLAG'),
  Schema.Literal('UNFLAG'),
  Schema.Literal('UPDATE_VOTING_SETTINGS'),
  Schema.Literal('UNKNOWN')
);

export type ApiActionType = Schema.Schema.Type<typeof ApiActionTypeSchema>;

/**
 * Proposal action with optional fields depending on action type.
 */
export const ApiActionSchema = Schema.Struct({
  actionType: ApiActionTypeSchema,
  targetId: Schema.optional(Schema.String),
  contentUri: Schema.optional(Schema.String),
  contentId: Schema.optional(Schema.String),
  quorum: Schema.optional(Schema.Number),
  fastThreshold: Schema.optional(Schema.Number),
  slowThreshold: Schema.optional(Schema.Number),
  duration: Schema.optional(Schema.Number),
});

export type ApiAction = Schema.Schema.Type<typeof ApiActionSchema>;

// ============================================================================
// Proposal Response Schemas
// ============================================================================

/**
 * Shared fields between detail and list proposal responses.
 */
const ApiProposalBaseFields = {
  proposalId: Schema.String,
  spaceId: Schema.String,
  name: Schema.NullOr(Schema.String),
  proposedBy: Schema.String,
  status: Schema.Union(
    Schema.Literal('PROPOSED'),
    Schema.Literal('EXECUTABLE'),
    Schema.Literal('ACCEPTED'),
    Schema.Literal('REJECTED')
  ),
  votingMode: Schema.Union(Schema.Literal('FAST'), Schema.Literal('SLOW')),
  actions: Schema.Array(ApiActionSchema),
  userVote: Schema.NullOr(ApiVoteOptionSchema),
  quorum: Schema.Struct({
    required: Schema.Number,
    current: Schema.Number,
    progress: Schema.Number,
    reached: Schema.Boolean,
  }),
  threshold: Schema.Struct({
    required: Schema.String,
    current: Schema.Number,
    progress: Schema.Number,
    reached: Schema.Boolean,
  }),
  timing: Schema.Struct({
    startTime: Schema.Number,
    endTime: Schema.Number,
    timeRemaining: Schema.NullOr(Schema.Number),
    isVotingEnded: Schema.Boolean,
  }),
  canExecute: Schema.Boolean,
};

/**
 * Full proposal detail response from GET /proposals/:id/status.
 * Includes individual voter records.
 */
export const ApiProposalStatusResponseSchema = Schema.Struct({
  ...ApiProposalBaseFields,
  votes: Schema.Struct({
    yes: Schema.Number,
    no: Schema.Number,
    abstain: Schema.Number,
    total: Schema.Number,
    voters: Schema.Array(ApiVoteSchema),
  }),
});

export type ApiProposalStatusResponse = Schema.Schema.Type<typeof ApiProposalStatusResponseSchema>;

/**
 * Proposal list item response from GET /proposals/space/:spaceId/status.
 * Omits individual voter records — only aggregate counts.
 */
export const ApiProposalListItemSchema = Schema.Struct({
  ...ApiProposalBaseFields,
  votes: Schema.Struct({
    yes: Schema.Number,
    no: Schema.Number,
    abstain: Schema.Number,
    total: Schema.Number,
  }),
});

export type ApiProposalListItem = Schema.Schema.Type<typeof ApiProposalListItemSchema>;

/**
 * Paginated list of proposals from GET /proposals/space/:spaceId/status
 */
export const ApiProposalListResponseSchema = Schema.Struct({
  proposals: Schema.Array(ApiProposalListItemSchema),
  nextCursor: Schema.NullOr(Schema.String),
});

export type ApiProposalListResponse = Schema.Schema.Type<typeof ApiProposalListResponseSchema>;

// ============================================================================
// Mapping Functions
// ============================================================================

export function mapActionTypeToProposalType(actionType: string): ProposalType {
  switch (actionType) {
    case 'PUBLISH':
      return 'ADD_EDIT';
    case 'ADD_EDITOR':
      return 'ADD_EDITOR';
    case 'REMOVE_EDITOR':
      return 'REMOVE_EDITOR';
    case 'ADD_MEMBER':
      return 'ADD_MEMBER';
    case 'REMOVE_MEMBER':
      return 'REMOVE_MEMBER';
    default:
      return 'ADD_EDIT';
  }
}

export function mapProposalStatus(apiStatus: ApiProposalStatusResponse['status']): ProposalStatus {
  switch (apiStatus) {
    case 'PROPOSED':
      return 'PROPOSED';
    case 'EXECUTABLE':
      return 'PROPOSED';
    case 'ACCEPTED':
      return 'ACCEPTED';
    case 'REJECTED':
      return 'REJECTED';
    default:
      return 'PROPOSED';
  }
}

/**
 * Convert API vote option to internal vote format.
 *
 * Maps YES → ACCEPT, NO → REJECT, ABSTAIN → ABSTAIN
 */
export function convertVoteOption(vote: ApiVoteOption): 'ACCEPT' | 'REJECT' | 'ABSTAIN' {
  switch (vote) {
    case 'YES':
      return 'ACCEPT';
    case 'NO':
      return 'REJECT';
    case 'ABSTAIN':
      return 'ABSTAIN';
  }
}
