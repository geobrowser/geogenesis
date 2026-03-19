/**
 * Shared Effect Schema definitions for proposal-related API responses.
 *
 * These schemas define the contract between the frontend and the gaia API.
 * All proposal fetch functions should import from here to ensure consistency.
 */
import { Schema } from 'effect';

import type {
  SpaceTopicProposalDetails,
  SubspaceEdgeProposalDetails,
  SubspaceProposalDetails,
  SubspaceTopicProposalDetails,
} from '../../dto/proposals';
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
  Schema.Literal('SUBSPACE_VERIFIED'),
  Schema.Literal('SUBSPACE_UNVERIFIED'),
  Schema.Literal('SUBSPACE_RELATED'),
  Schema.Literal('SUBSPACE_UNRELATED'),
  Schema.Literal('SUBSPACE_TOPIC_DECLARED'),
  Schema.Literal('SUBSPACE_TOPIC_REMOVED'),
  Schema.Literal('TOPIC_DECLARED'),
  Schema.Literal('TOPIC_REMOVED'),
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
  targetSpaceId: Schema.optional(Schema.String),
  targetTopicId: Schema.optional(Schema.String),
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

const SUBSPACE_ACTION_TYPES = new Set<ApiActionType>([
  'SUBSPACE_VERIFIED',
  'SUBSPACE_UNVERIFIED',
  'SUBSPACE_RELATED',
  'SUBSPACE_UNRELATED',
  'SUBSPACE_TOPIC_DECLARED',
  'SUBSPACE_TOPIC_REMOVED',
]);

const SPACE_TOPIC_ACTION_TYPES = new Set<ApiActionType>(['TOPIC_DECLARED', 'TOPIC_REMOVED']);

// ============================================================================
// Mapping Functions
// ============================================================================

function isSubspaceActionType(actionType: ApiActionType): actionType is SubspaceProposalDetails['actionType'] {
  return SUBSPACE_ACTION_TYPES.has(actionType);
}

export function isTopicSubspaceActionType(
  actionType: ApiActionType
): actionType is SubspaceTopicProposalDetails['actionType'] {
  return actionType === 'SUBSPACE_TOPIC_DECLARED' || actionType === 'SUBSPACE_TOPIC_REMOVED';
}

export function isEdgeSubspaceActionType(
  actionType: ApiActionType
): actionType is SubspaceEdgeProposalDetails['actionType'] {
  return (
    actionType === 'SUBSPACE_VERIFIED' ||
    actionType === 'SUBSPACE_UNVERIFIED' ||
    actionType === 'SUBSPACE_RELATED' ||
    actionType === 'SUBSPACE_UNRELATED'
  );
}

export function isAddSubspaceActionType(actionType: ApiActionType): boolean {
  return (
    actionType === 'SUBSPACE_VERIFIED' || actionType === 'SUBSPACE_RELATED' || actionType === 'SUBSPACE_TOPIC_DECLARED'
  );
}

function isSpaceTopicActionType(actionType: ApiActionType): actionType is SpaceTopicProposalDetails['actionType'] {
  return SPACE_TOPIC_ACTION_TYPES.has(actionType);
}

function mapSubspaceActionToDetails(action: ApiAction): SubspaceProposalDetails | null {
  if (!isSubspaceActionType(action.actionType)) {
    return null;
  }

  switch (action.actionType) {
    case 'SUBSPACE_VERIFIED':
      return action.targetSpaceId
        ? {
            actionType: action.actionType,
            targetSpaceId: action.targetSpaceId,
          }
        : null;
    case 'SUBSPACE_UNVERIFIED':
      return action.targetSpaceId
        ? {
            actionType: action.actionType,
            targetSpaceId: action.targetSpaceId,
          }
        : null;
    case 'SUBSPACE_RELATED':
      return action.targetSpaceId
        ? {
            actionType: action.actionType,
            targetSpaceId: action.targetSpaceId,
          }
        : null;
    case 'SUBSPACE_UNRELATED':
      return action.targetSpaceId
        ? {
            actionType: action.actionType,
            targetSpaceId: action.targetSpaceId,
          }
        : null;
    case 'SUBSPACE_TOPIC_DECLARED':
      return action.targetTopicId
        ? {
            actionType: action.actionType,
            targetTopicId: action.targetTopicId,
          }
        : null;
    case 'SUBSPACE_TOPIC_REMOVED':
      return action.targetTopicId
        ? {
            actionType: action.actionType,
            targetTopicId: action.targetTopicId,
          }
        : null;
  }
}

export function getSubspaceProposalDetails(actions: readonly ApiAction[]): SubspaceProposalDetails | null {
  const subspaceActions = actions.filter(action => isSubspaceActionType(action.actionType));

  if (subspaceActions.length !== 1) {
    return null;
  }

  return mapSubspaceActionToDetails(subspaceActions[0]);
}

function mapSpaceTopicActionToDetails(action: ApiAction): SpaceTopicProposalDetails | null {
  if (!isSpaceTopicActionType(action.actionType) || !action.targetTopicId) {
    return null;
  }

  return {
    actionType: action.actionType,
    targetTopicId: action.targetTopicId,
  };
}

export function getSpaceTopicProposalDetails(actions: readonly ApiAction[]): SpaceTopicProposalDetails | null {
  const topicActions = actions.filter(action => isSpaceTopicActionType(action.actionType));

  if (topicActions.length !== 1) {
    return null;
  }

  return mapSpaceTopicActionToDetails(topicActions[0]);
}

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
    case 'SUBSPACE_VERIFIED':
    case 'SUBSPACE_RELATED':
    case 'SUBSPACE_TOPIC_DECLARED':
      return 'ADD_SUBSPACE';
    case 'SUBSPACE_UNVERIFIED':
    case 'SUBSPACE_UNRELATED':
    case 'SUBSPACE_TOPIC_REMOVED':
      return 'REMOVE_SUBSPACE';
    case 'TOPIC_DECLARED':
    case 'TOPIC_REMOVED':
      return 'SET_TOPIC';
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
