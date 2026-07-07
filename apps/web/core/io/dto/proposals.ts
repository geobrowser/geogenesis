import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { OmitStrict, Profile } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { ProposalStatus, ProposalType, SubstreamProposal, SubstreamVote } from '../substream-schema';
import { VersionDto } from './versions';

export type VoteWithProfile = SubstreamVote & { voter: Profile };

type SpaceWithImage = {
  id: string;
  name: string | null;
  image: string;
};

export type SubspaceEdgeProposalDetails = {
  actionType: 'SUBSPACE_VERIFIED' | 'SUBSPACE_UNVERIFIED' | 'SUBSPACE_RELATED' | 'SUBSPACE_UNRELATED';
  targetSpaceId: string;
};

export type SubspaceTopicProposalDetails = {
  actionType: 'SUBSPACE_TOPIC_DECLARED' | 'SUBSPACE_TOPIC_REMOVED';
  targetTopicId: string;
};

export type SubspaceProposalDetails = SubspaceEdgeProposalDetails | SubspaceTopicProposalDetails;

export type SpaceTopicProposalDetails = {
  actionType: 'SET_TOPIC' | 'UNSET_TOPIC' | 'TOPIC_DECLARED' | 'TOPIC_REMOVED';
  targetTopicId: string;
};

/**
 * Proposed new voting settings for an `UPDATE_VOTING_SETTINGS` proposal. Values are raw
 * from the API action: `slowThreshold` is a contract ratio (1e7 = 100%), `duration` is in
 * seconds, and `fastThreshold`/`quorum` are editor counts. The API only carries these four
 * user-facing fields (not universal support / grace period / new-member fast-path).
 */
export type VotingSettingsProposalDetails = {
  slowThreshold?: number;
  fastThreshold?: number;
  quorum?: number;
  durationSeconds?: number;
};

export type Proposal = {
  id: string;
  /** Proposal version this data describes (REST `proposalVersion`). Votes must
   *  target it; undefined when the source doesn't expose versions. */
  version?: number;
  editId: string;
  type: ProposalType;
  name: string | null;
  createdBy: Profile;
  createdAt: number;
  createdAtBlock: string;
  space: SpaceWithImage;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  canExecute: boolean;
  proposalVotes: {
    totalCount: number;
    nodes: VoteWithProfile[];
  };
  subspaceDetails?: SubspaceProposalDetails;
  spaceTopicDetails?: SpaceTopicProposalDetails;
  /** Proposed new voting settings, for `UPDATE_VOTING_SETTINGS` proposals. */
  votingSettingsDetails?: VotingSettingsProposalDetails;
  /** The person being added/removed, for membership proposals. */
  targetProfile?: Profile;
};

export function ProposalDto(
  proposal: SubstreamProposal,
  maybeCreatorProfile: Profile | undefined,
  voterProfiles: Profile[]
): Proposal {
  const profile = maybeCreatorProfile ?? {
    id: proposal.createdById,
    spaceId: proposal.createdById,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: proposal.createdById as `0x${string}`,
    profileLink: null,
  };

  const spaceConfig = proposal.space.spacesMetadatum;
  const entity = spaceConfig ? VersionDto(spaceConfig.version) : null;

  const spaceWithMetadata: SpaceWithImage = {
    id: proposal.space.id,
    name: entity?.name ?? null,
    image: Entities.avatar(entity?.relations) ?? Entities.cover(entity?.relations) ?? PLACEHOLDER_SPACE_IMAGE,
  };

  return {
    id: proposal.id,
    editId: proposal.edit?.id ?? '',
    name: proposal.edit?.name ?? null,
    createdAt: proposal.edit?.createdAt ?? 0,
    createdAtBlock: proposal.edit?.createdAtBlock ?? '0',
    type: proposal.type,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    status: proposal.status,
    canExecute: false,
    space: spaceWithMetadata,
    createdBy: profile,
    proposalVotes: {
      totalCount: proposal.proposalVotes.totalCount,
      nodes: proposal.proposalVotes.nodes.map(v => {
        // v.accountId is a space ID (bytes16 hex), so match against voter.spaceId
        const maybeProfile = voterProfiles.find(voter => v.accountId === voter.spaceId);

        const voter = maybeProfile
          ? maybeProfile
          : {
              id: v.accountId,
              spaceId: v.accountId,
              address: v.accountId as `0x${string}`,
              name: null,
              avatarUrl: null,
              coverUrl: null,
              profileLink: null,
            };

        return {
          ...v,
          vote: v.vote,
          voter,
        };
      }),
    },
  };
}

export type ProposalWithoutVoters = OmitStrict<Proposal, 'proposalVotes'>;

export function ProposalWithoutVotersDto(
  proposal: SubstreamProposal,
  maybeCreatorProfile?: Profile | null
): ProposalWithoutVoters {
  const profile = maybeCreatorProfile ?? {
    id: proposal.createdById,
    spaceId: proposal.createdById,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: proposal.createdById as `0x${string}`,
    profileLink: null,
  };

  const spaceConfig = proposal.space.spacesMetadatum;
  const entity = spaceConfig ? VersionDto(spaceConfig.version) : null;

  const spaceWithMetadata: SpaceWithImage = {
    id: proposal.space.id,
    name: entity?.name ?? null,
    image: Entities.avatar(entity?.relations) ?? Entities.cover(entity?.relations) ?? PLACEHOLDER_SPACE_IMAGE,
  };

  return {
    id: proposal.id,
    editId: proposal.edit?.id ?? '',
    name: proposal.edit?.name ?? null,
    createdAt: proposal.edit?.createdAt ?? 0,
    createdAtBlock: proposal.edit?.createdAtBlock ?? '0',
    type: proposal.type,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    status: proposal.status,
    canExecute: false,
    space: spaceWithMetadata,
    createdBy: profile,
  };
}
