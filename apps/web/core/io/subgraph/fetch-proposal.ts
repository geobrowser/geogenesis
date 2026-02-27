import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Proposal } from '../dto/proposals';
import {
  ApiError,
  type ApiProposalStatusResponse,
  ApiProposalStatusResponseSchema,
  convertVoteOption,
  encodePathSegment,
  mapActionTypeToProposalType,
  mapProposalStatus,
  restFetch,
} from '../rest';
import { Address, SubstreamVote } from '../substream-schema';
import { AbortError } from './errors';
import { defaultProfile, fetchProfileBySpaceId, fetchProfilesBySpaceIds } from './fetch-profile';

export interface FetchProposalOptions {
  id: string;
  signal?: AbortController['signal'];
  voterId?: string;
}

/**
 * Fetch a single proposal by ID using the new REST API.
 *
 * Uses the REST endpoint: GET /proposals/:id/status
 */
export async function fetchProposal(options: FetchProposalOptions): Promise<Proposal | null> {
  const config = Environment.getConfig();
  const { id, signal, voterId } = options;

  // Build path with proper encoding
  const encodedId = encodePathSegment(id);
  const queryParams = voterId ? `?voterId=${encodeURIComponent(voterId)}` : '';
  const path = `/proposals/${encodedId}/status${queryParams}`;

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
    const voter = maybeProfile ?? defaultProfile(v.accountId, v.accountId);
    return { ...v, voter };
  });

  const profile: Profile = creatorProfile ?? defaultProfile(apiProposal.proposedBy, apiProposal.proposedBy);

  return {
    id: apiProposal.proposalId,
    editId: '',
    name: apiProposal.name,
    type: proposalType,
    createdAt: 0,
    createdAtBlock: '0',
    startTime: apiProposal.timing.startTime,
    endTime: apiProposal.timing.endTime,
    status: mapProposalStatus(apiProposal.status),
    canExecute: apiProposal.canExecute,
    space: {
      id: apiProposal.spaceId,
      name: null,
      image: '',
    },
    createdBy: profile,
    proposalVotes: {
      totalCount: apiProposal.votes.total,
      nodes: votesWithProfiles,
    },
  };
}
