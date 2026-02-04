import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Proposal } from '../dto/proposals';
import { ApiError, restFetch } from '../rest';
import { Address, ProposalStatus, ProposalType, SubstreamVote } from '../substream-schema';
import { AbortError } from './errors';
import { fetchProfileBySpaceId, fetchProfilesBySpaceIds } from './fetch-profile';

/**
 * API response types matching the gaia proposal status endpoint.
 */
type ApiVoteOption = 'YES' | 'NO' | 'ABSTAIN';

interface ApiVote {
  voterId: string;
  vote: ApiVoteOption;
}

type ApiActionType =
  | 'ADD_MEMBER'
  | 'REMOVE_MEMBER'
  | 'ADD_EDITOR'
  | 'REMOVE_EDITOR'
  | 'UNFLAG_EDITOR'
  | 'PUBLISH'
  | 'FLAG'
  | 'UNFLAG'
  | 'UPDATE_VOTING_SETTINGS'
  | 'UNKNOWN';

interface ApiAction {
  actionType: ApiActionType;
  targetId?: string;
  contentUri?: string;
  contentId?: string;
  quorum?: number;
  fastThreshold?: number;
  slowThreshold?: number;
  duration?: number;
}

interface ApiProposalStatusResponse {
  proposalId: string;
  spaceId: string;
  name: string | null;
  proposedBy: string;
  status: 'PROPOSED' | 'EXECUTABLE' | 'ACCEPTED' | 'REJECTED';
  votingMode: 'FAST' | 'SLOW';
  actions: ApiAction[];
  votes: {
    yes: number;
    no: number;
    abstain: number;
    total: number;
    voters: ApiVote[];
  };
  userVote: ApiVoteOption | null;
  quorum: {
    required: number;
    current: number;
    progress: number;
    reached: boolean;
  };
  threshold: {
    required: string;
    current: number;
    progress: number;
    reached: boolean;
  };
  timing: {
    startTime: number;
    endTime: number;
    timeRemaining: number | null;
    isVotingEnded: boolean;
  };
  canExecute: boolean;
}

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
      restFetch<ApiProposalStatusResponse>({
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

  const apiProposal = result.right;

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
