import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Proposal } from '../dto/proposals';
import { ApiError, restFetch } from '../rest';
import { Address, ProposalStatus, ProposalType, SubstreamVote } from '../substream-schema';
import { AbortError } from './errors';
import { fetchProfileBySpaceId, fetchProfilesBySpaceIds } from './fetch-profile';

/**
 * Schema for API vote option.
 */
const ApiVoteOptionSchema = Schema.Union(
  Schema.Literal('YES'),
  Schema.Literal('NO'),
  Schema.Literal('ABSTAIN')
);

type ApiVoteOption = Schema.Schema.Type<typeof ApiVoteOptionSchema>;

/**
 * Schema for API vote.
 */
const ApiVoteSchema = Schema.Struct({
  voterId: Schema.String,
  vote: ApiVoteOptionSchema,
});

/**
 * Schema for API action type.
 */
const ApiActionTypeSchema = Schema.Union(
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

type ApiActionType = Schema.Schema.Type<typeof ApiActionTypeSchema>;

/**
 * Schema for API action.
 */
const ApiActionSchema = Schema.Struct({
  actionType: ApiActionTypeSchema,
  targetId: Schema.optional(Schema.String),
  contentUri: Schema.optional(Schema.String),
  contentId: Schema.optional(Schema.String),
  quorum: Schema.optional(Schema.Number),
  fastThreshold: Schema.optional(Schema.Number),
  slowThreshold: Schema.optional(Schema.Number),
  duration: Schema.optional(Schema.Number),
});

/**
 * Schema for API proposal status response.
 */
const ApiProposalStatusResponseSchema = Schema.Struct({
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
  votes: Schema.Struct({
    yes: Schema.Number,
    no: Schema.Number,
    abstain: Schema.Number,
    total: Schema.Number,
    voters: Schema.Array(ApiVoteSchema),
  }),
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
});

type ApiProposalStatusResponse = Schema.Schema.Type<typeof ApiProposalStatusResponseSchema>;

export interface FetchProposalOptions {
  id: string;
  signal?: AbortController['signal'];
  voterId?: string;
}

/**
 * Map API action type to internal ProposalType.
 */
function mapActionTypeToProposalType(actionType: ApiActionType): ProposalType {
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

/**
 * Convert API vote option to internal vote format.
 */
function convertVoteOption(vote: ApiVoteOption): 'ACCEPT' | 'REJECT' {
  return vote === 'YES' ? 'ACCEPT' : 'REJECT';
}

/**
 * Map API proposal status to internal ProposalStatus.
 * The new API has richer status (EXECUTABLE), but we map it to existing types.
 */
function mapProposalStatus(apiStatus: ApiProposalStatusResponse['status']): ProposalStatus {
  switch (apiStatus) {
    case 'PROPOSED':
      return 'PROPOSED';
    case 'EXECUTABLE':
      // EXECUTABLE means voting ended and ready to execute - treat as PROPOSED until executed
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
 * Fetch a single proposal by ID using the new REST API.
 *
 * Uses the REST endpoint: GET /proposals/:id/status
 */
export async function fetchProposal(options: FetchProposalOptions): Promise<Proposal | null> {
  const config = Environment.getConfig();
  const { id, signal, voterId } = options;

  const path = voterId ? `/proposals/${id}/status?voterId=${voterId}` : `/proposals/${id}/status`;

  const result = await Effect.runPromise(
    Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path,
        signal,
      })
    )
  );

  if (Either.isLeft(result)) {
    const error = result.left;

    if (error instanceof AbortError) {
      throw error;
    }

    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    console.error(`Failed to fetch proposal ${id}:`, error);
    return null;
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalStatusResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode proposal ${id}:`, decoded.left);
    return null;
  }

  const apiProposal = decoded.right;

  // Fetch profiles for the creator and voters
  const voterIds = apiProposal.votes.voters.map(v => v.voterId);
  const [creatorProfile, voterProfiles] = await Promise.all([
    Effect.runPromise(fetchProfileBySpaceId(apiProposal.proposedBy)),
    Effect.runPromise(fetchProfilesBySpaceIds(voterIds)),
  ]);

  // Determine proposal type from the first action
  const firstAction = apiProposal.actions[0];
  const proposalType = mapActionTypeToProposalType(firstAction?.actionType ?? 'UNKNOWN');

  // Convert votes to internal format
  const votes: SubstreamVote[] = apiProposal.votes.voters.map(v => ({
    vote: convertVoteOption(v.vote),
    accountId: Address(v.voterId),
  }));

  // Build voter profiles map
  const votesWithProfiles = votes.map((v, i) => {
    const maybeProfile = voterProfiles[i];
    const voter = maybeProfile ?? {
      id: v.accountId,
      spaceId: v.accountId,
      address: v.accountId as `0x${string}`,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      profileLink: null,
    };
    return { ...v, voter };
  });

  const profile: Profile = creatorProfile ?? {
    id: apiProposal.proposedBy,
    spaceId: apiProposal.proposedBy,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: apiProposal.proposedBy as `0x${string}`,
    profileLink: NavUtils.toSpace(apiProposal.proposedBy),
  };

  return {
    id: apiProposal.proposalId,
    editId: '', // Not provided by new API, will need to be fetched separately if needed
    name: apiProposal.name,
    type: proposalType,
    createdAt: 0, // Not directly provided, could be derived from startTime if needed
    createdAtBlock: '0', // Not provided by new API
    startTime: apiProposal.timing.startTime,
    endTime: apiProposal.timing.endTime,
    status: mapProposalStatus(apiProposal.status),
    space: {
      id: apiProposal.spaceId,
      name: null, // Would need to fetch space metadata separately
      image: '',
    },
    createdBy: profile,
    proposalVotes: {
      totalCount: apiProposal.votes.total,
      nodes: votesWithProfiles,
    },
  };
}
