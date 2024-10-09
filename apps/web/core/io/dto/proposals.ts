import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { AppOp, OmitStrict, Profile, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { ProposalStatus, ProposalType, SubstreamProposal, SubstreamVote } from '../schema';
import { EntityDto } from './entities';

export type VoteWithProfile = SubstreamVote & { voter: Profile };

type SpaceWithImage = {
  id: string;
  name: string | null;
  image: string;
};

export type Proposal = {
  id: string;
  type: ProposalType;
  onchainProposalId: string;
  name: string | null;
  createdBy: Profile;
  createdAt: number;
  createdAtBlock: number;
  space: SpaceWithImage;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  proposalVotes: {
    totalCount: number;
    nodes: VoteWithProfile[];
  };
  proposedVersions: ProposedVersion[];
};

export function ProposalDto(
  proposal: SubstreamProposal,
  maybeCreatorProfile: Profile | undefined,
  voterProfiles: Profile[]
): Proposal {
  const profile = maybeCreatorProfile ?? {
    id: proposal.createdBy.id,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: proposal.createdBy.id as `0x${string}`,
    profileLink: null,
  };

  const spaceConfig = proposal.space.spacesMetadata.nodes[0].entity;
  const entity = spaceConfig ? EntityDto(spaceConfig) : null;

  const spaceWithMetadata: SpaceWithImage = {
    id: proposal.space.id,
    name: entity?.name ?? null,
    image: Entities.avatar(entity?.relationsOut) ?? Entities.cover(entity?.relationsOut) ?? PLACEHOLDER_SPACE_IMAGE,
  };

  return {
    id: proposal.id,
    name: proposal.name,
    type: proposal.type,
    onchainProposalId: proposal.onchainProposalId,
    createdAt: proposal.createdAt,
    createdAtBlock: proposal.createdAtBlock,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    status: proposal.status,
    space: spaceWithMetadata,
    createdBy: profile,
    proposalVotes: {
      totalCount: proposal.proposalVotes.totalCount,
      nodes: proposal.proposalVotes.nodes.map(v => {
        const maybeProfile = voterProfiles.find(voter => v.account.id === voter.address);

        const voter = maybeProfile
          ? maybeProfile
          : {
              id: v.account.id,
              address: v.account.id as `0x${string}`,
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
    proposedVersions: proposal.proposedVersions.nodes.map(pv => ({
      id: pv.id,
      createdBy: {
        id: '',
        name: null,
        avatarUrl: null,
        coverUrl: null,
        address: '0x0000000000000000000000000000000000000000',
        profileLink: null,
      },
      createdAt: 0,
      createdAtBlock: 0,
      entity: pv.entity,
    })),
  };
}

export type ProposalWithoutVoters = OmitStrict<Proposal, 'proposalVotes' | 'proposedVersions'>;

export function ProposalWithoutVotersDto(
  proposal: SubstreamProposal,
  maybeCreatorProfile?: Profile | null
): ProposalWithoutVoters {
  const profile = maybeCreatorProfile ?? {
    id: proposal.createdBy.id,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: proposal.createdBy.id as `0x${string}`,
    profileLink: null,
  };

  const spaceConfig = proposal.space.spacesMetadata.nodes[0].entity;
  const entity = spaceConfig ? EntityDto(spaceConfig) : null;

  const spaceWithMetadata: SpaceWithImage = {
    id: proposal.space.id,
    name: entity?.name ?? null,
    image: Entities.avatar(entity?.relationsOut) ?? Entities.cover(entity?.relationsOut) ?? PLACEHOLDER_SPACE_IMAGE,
  };

  return {
    id: proposal.id,
    name: proposal.name,
    type: proposal.type,
    onchainProposalId: proposal.onchainProposalId,
    createdAt: proposal.createdAt,
    createdAtBlock: proposal.createdAtBlock,
    startTime: proposal.startTime,
    endTime: proposal.endTime,
    status: proposal.status,
    space: spaceWithMetadata,
    createdBy: profile,
  };
}
