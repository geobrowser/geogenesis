import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { ProposalWithoutVoters } from '../dto/proposals';
import { restFetch } from '../rest';
import { ProposalStatus, ProposalType } from '../substream-schema';
import { AbortError } from './errors';
import { fetchProfilesBySpaceIds } from './fetch-profile';

/**
 * API response types matching the gaia proposal list endpoint.
 */
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
  };
  timing: {
    startTime: number;
    endTime: number;
    timeRemaining: number | null;
    isVotingEnded: boolean;
  };
  canExecute: boolean;
}

interface ApiProposalListResponse {
  proposals: ApiProposalStatusResponse[];
  nextCursor: string | null;
}

export interface FetchProposalsOptions {
  spaceId: string;
  signal?: AbortController['signal'];
  page?: number;
  first?: number;
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
 * Map API proposal status to internal ProposalStatus.
 */
function mapProposalStatus(apiStatus: ApiProposalStatusResponse['status']): ProposalStatus {
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
 * Convert API proposal response to ProposalWithoutVoters.
 */
function apiProposalToDto(proposal: ApiProposalStatusResponse, profile?: Profile): ProposalWithoutVoters {
  const profileData: Profile = profile ?? {
    id: proposal.proposedBy,
    spaceId: proposal.proposedBy,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: proposal.proposedBy as `0x${string}`,
    profileLink: NavUtils.toSpace(proposal.proposedBy),
  };

  const firstAction = proposal.actions[0];
  const proposalType = mapActionTypeToProposalType(firstAction?.actionType ?? 'UNKNOWN');

  return {
    id: proposal.proposalId,
    editId: '',
    name: proposal.name,
    type: proposalType,
    createdAt: 0,
    createdAtBlock: '0',
    startTime: proposal.timing.startTime,
    endTime: proposal.timing.endTime,
    status: mapProposalStatus(proposal.status),
    space: {
      id: proposal.spaceId,
      name: null,
      image: '',
    },
    createdBy: profileData,
  };
}

/**
 * Fetch completed proposals for a space using the new REST API.
 *
 * Uses the REST endpoint: GET /proposals/space/:spaceId/status with filtering
 *
 * Only fetches PUBLISH action types (ADD_EDIT) that are in ACCEPTED status.
 */
export async function fetchCompletedProposals({
  spaceId,
  signal,
  page = 0,
  first = 5,
}: FetchProposalsOptions): Promise<ProposalWithoutVoters[]> {
  const config = Environment.getConfig();

  // Build query parameters
  // Filter for Publish actions only (equivalent to ADD_EDIT proposals)
  const params = new URLSearchParams();
  params.set('limit', String(first));
  params.set('actionTypes', 'Publish');

  // For page-based pagination, we need to fetch pages sequentially
  let cursor: string | undefined;
  let proposals: ApiProposalStatusResponse[] = [];

  for (let i = 0; i <= page; i++) {
    const pageParams = new URLSearchParams(params);
    if (cursor) {
      pageParams.set('cursor', cursor);
    }

    const path = `/proposals/space/${spaceId}/status?${pageParams.toString()}`;

    const result = await Effect.runPromise(
      Effect.either(
        restFetch<ApiProposalListResponse>({
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

      console.error(`Failed to fetch completed proposals for space ${spaceId}:`, error);
      return [];
    }

    proposals = result.right.proposals;
    cursor = result.right.nextCursor ?? undefined;

    if (i === page) {
      break;
    }

    if (!cursor) {
      return [];
    }
  }

  // Filter for ACCEPTED status client-side (the API returns all statuses)
  const acceptedProposals = proposals.filter(p => p.status === 'ACCEPTED');

  // Fetch profiles for creators
  const creatorIds = acceptedProposals.map(p => p.proposedBy);
  const uniqueCreatorIds = [...new Set(creatorIds)];
  const profilesForProposals = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueCreatorIds));
  const profilesBySpaceId = new Map(uniqueCreatorIds.map((id, i) => [id, profilesForProposals[i]]));

  return acceptedProposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    return apiProposalToDto(p, maybeProfile);
  });
}
