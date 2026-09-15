import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Profile } from '~/core/types';

import { Proposal } from '../dto/proposals';
import {
  ApiError,
  ApiProposalStatusResponseSchema,
  convertVoteOption,
  encodePathSegment,
  findMembershipAction,
  getApiProposalCanExecute,
  getSpaceTopicProposalDetails,
  getSubspaceProposalDetails,
  getVotingSettingsProposalDetails,
  mapApiActionsToProposalType,
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

type ApiProposalStatus = Schema.Schema.Type<typeof ApiProposalStatusResponseSchema>;

/**
 * Load and decode a proposal's status payload, or `null` where there is no proposal at that id.
 *
 * Shared by the readers below so one place knows the endpoint, how an id becomes a path segment, and
 * which failures mean "no such proposal" rather than "the request broke".
 */
async function fetchApiProposalStatus(options: FetchProposalOptions): Promise<ApiProposalStatus | null> {
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

  return decoded.right;
}

export type ProposalVotes = {
  /** The space the proposal belongs to, which is not necessarily the space it is being viewed from. */
  spaceId: string;
  /** Keyed by personal space id, in the internal vocabulary rather than the wire's YES/NO. */
  votes: { voterSpaceId: string; vote: 'ACCEPT' | 'REJECT' | 'ABSTAIN' }[];
};

/**
 * A proposal's owning space and its vote records — and nothing else.
 *
 * `fetchProposal` below hydrates the creator's profile, every voter's profile, and on a membership
 * request the target's, because the review screen draws all of them. A caller that only needs to know
 * who voted which way would pay for all of that and discard it, which matters here: the comment
 * attribution query is invalidated repeatedly as a vote settles through the indexer, so the waste
 * repeats with it (GEO-2907).
 */
export async function fetchProposalVotes(options: FetchProposalOptions): Promise<ProposalVotes | null> {
  const apiProposal = await fetchApiProposalStatus(options);
  if (!apiProposal) return null;

  return {
    spaceId: apiProposal.spaceId,
    votes: apiProposal.votes.voters.map(v => ({ voterSpaceId: v.voterId, vote: convertVoteOption(v.vote) })),
  };
}

/**
 * Fetch a single proposal by ID using the new REST API.
 *
 * Uses the REST endpoint: GET /proposals/:id/status
 */
export async function fetchProposal(options: FetchProposalOptions): Promise<Proposal | null> {
  const apiProposal = await fetchApiProposalStatus(options);
  if (!apiProposal) return null;

  // On membership requests `proposedBy` is the DAO space itself, so the
  // action's targetId is the only way to know who the request is about.
  const membershipAction = findMembershipAction(apiProposal.actions);

  const voterIds = apiProposal.votes.voters.map(v => v.voterId);
  const [creatorProfile, voterProfiles, targetProfile] = await Promise.all([
    Effect.runPromise(fetchProfileBySpaceId(apiProposal.proposedBy)),
    Effect.runPromise(fetchProfilesBySpaceIds(voterIds)),
    membershipAction?.targetId ? Effect.runPromise(fetchProfileBySpaceId(membershipAction.targetId)) : undefined,
  ]);

  const proposalType = mapApiActionsToProposalType(apiProposal.actions);
  const subspaceDetails = getSubspaceProposalDetails(apiProposal.actions);
  const spaceTopicDetails = getSpaceTopicProposalDetails(apiProposal.actions);
  const votingSettingsDetails = getVotingSettingsProposalDetails(apiProposal.actions);

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
    version: apiProposal.proposalVersion,
    editId: '',
    name: apiProposal.name,
    type: proposalType,
    createdAt: 0,
    createdAtBlock: '0',
    startTime: apiProposal.timing.startTime,
    endTime: apiProposal.timing.endTime,
    status: mapProposalStatus(apiProposal.status),
    canExecute: getApiProposalCanExecute(apiProposal),
    votingMode: apiProposal.votingMode,
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
    subspaceDetails: subspaceDetails ?? undefined,
    spaceTopicDetails: spaceTopicDetails ?? undefined,
    votingSettingsDetails: votingSettingsDetails ?? undefined,
    targetProfile,
  };
}
