import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { OmitStrict, Profile } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { ProposalStatus, ProposalType, SubstreamProposal, SubstreamVote } from '../schema';
import { VersionDto } from './versions';

export type VoteWithProfile = SubstreamVote & { voter: Profile };

type SpaceWithImage = {
  id: string;
  name: string | null;
  image: string;
};

export type Proposal = {
  id: string;
  editId: string;
  type: ProposalType;
  onchainProposalId: string;
  name: string | null;
  createdBy: Profile;
  createdAt: number;
  createdAtBlock: string;
  space: SpaceWithImage;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  proposalVotes: {
    totalCount: number;
    nodes: VoteWithProfile[];
  };
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
    onchainProposalId: proposal.onchainProposalId,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    status: proposal.status,
    space: spaceWithMetadata,
    createdBy: profile,
    proposalVotes: {
      totalCount: proposal.proposalVotes.totalCount,
      nodes: proposal.proposalVotes.nodes.map(v => {
        const maybeProfile = voterProfiles.find(voter => v.accountId === voter.address);

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
    onchainProposalId: proposal.onchainProposalId,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    status: proposal.status,
    space: spaceWithMetadata,
    createdBy: profile,
  };
}
