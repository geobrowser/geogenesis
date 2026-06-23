import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { ProposalWithoutVoters } from '../dto/proposals';
import {
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  encodePathSegment,
  mapActionTypeToProposalType,
  mapProposalStatus,
  restFetch,
  validateActionTypes,
} from '../rest';
import { AbortError } from './errors';
import { defaultProfile, fetchProfilesBySpaceIds } from './fetch-profile';

export interface FetchProposalsOptions {
  spaceId: string;
  signal?: AbortController['signal'];
  page?: number;
  first?: number;
  actionTypes?: string[];
  excludeActionTypes?: string[];
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
 * Fetch proposals for a space using the new REST API.
 *
 * Uses the REST endpoint: GET /proposals/space/:spaceId/status
 *
 * Note: The API uses cursor-based pagination, but this function maintains
 * the existing page-based interface for backwards compatibility.
 */
export async function fetchProposals({
  spaceId,
  signal,
  page = 0,
  first = 5,
  actionTypes,
  excludeActionTypes,
}: FetchProposalsOptions): Promise<ProposalWithoutVoters[]> {
  const config = Environment.getConfig();

  // Build query parameters
  const params = new URLSearchParams();
  params.set('limit', String(first));

  // Validate and set action type filters
  if (actionTypes?.length) {
    const validTypes = validateActionTypes(actionTypes);
    if (validTypes.length > 0) {
      params.set('actionTypes', validTypes.join(','));
    }
  }
  if (excludeActionTypes?.length) {
    const validTypes = validateActionTypes(excludeActionTypes);
    if (validTypes.length > 0) {
      params.set('excludeActionTypes', validTypes.join(','));
    }
  }

  // For page-based pagination, we need to fetch pages sequentially to get cursors
  // This is a temporary solution - ideally callers should be updated to use cursor pagination
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

      console.error(`Failed to fetch proposals for space ${spaceId}:`, error);
      return [];
    }

    const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

    if (Either.isLeft(decoded)) {
      console.error(`Failed to decode proposals for space ${spaceId}:`, decoded.left);
      return [];
    }

    proposals = decoded.right.proposals;
    cursor = decoded.right.nextCursor ?? undefined;

    // If we've reached the requested page, stop
    if (i === page) {
      break;
    }

    // If there's no next cursor, we've reached the end
    if (!cursor) {
      return [];
    }
  }

  // Fetch profiles for creators
  const creatorIds = proposals.map(p => p.proposedBy);
  const uniqueCreatorIds = [...new Set(creatorIds)];
  const profilesForProposals = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueCreatorIds));
  const profilesBySpaceId = new Map(uniqueCreatorIds.map((id, i) => [id, profilesForProposals[i]]));

  return proposals.map(p => {
    const maybeProfile = profilesBySpaceId.get(p.proposedBy);
    return apiProposalToDto(p, maybeProfile);
  });
}
