import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';

import { ProposalWithoutVoters } from '../dto/proposals';
import {
  restFetch,
  ApiProposalListResponseSchema,
  mapActionTypeToProposalType,
  mapProposalStatus,
  encodePathSegment,
  type ApiProposalListItem,
} from '../rest';
import { AbortError } from './errors';
import { defaultProfile, fetchProfilesBySpaceIds } from './fetch-profile';

export interface FetchProposalsOptions {
  spaceId: string;
  signal?: AbortController['signal'];
  page?: number;
  first?: number;
}

function apiProposalToDto(proposal: ApiProposalListItem, profile?: Profile): ProposalWithoutVoters {
  const profileData: Profile = profile ?? defaultProfile(proposal.proposedBy, proposal.proposedBy);

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
    canExecute: proposal.canExecute,
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
  let proposals: readonly ApiProposalListItem[] = [];

  for (let i = 0; i <= page; i++) {
    const pageParams = new URLSearchParams(params);
    if (cursor) {
      pageParams.set('cursor', cursor);
    }

    const path = `/proposals/space/${encodePathSegment(spaceId)}/status?${pageParams.toString()}`;

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

      console.error(`Failed to fetch completed proposals for space ${spaceId}:`, error);
      return [];
    }

    const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

    if (Either.isLeft(decoded)) {
      console.error(`Failed to decode completed proposals for space ${spaceId}:`, decoded.left);
      return [];
    }

    proposals = decoded.right.proposals;
    cursor = decoded.right.nextCursor ?? undefined;

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
