import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { OmitStrict, Profile, SpaceWithMetadata, Vote } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { TripleDto } from '../dto';
import { ProposalStatus, ProposalType, SubstreamEntity, SubstreamProposal } from '../schema';

export type VoteWithProfile = Vote & { voter: Profile };

export type Proposal = {
  id: string;
  type: ProposalType;
  onchainProposalId: string;
  name: string | null;
  createdBy: Profile;
  createdAt: number;
  createdAtBlock: string;
  space: SpaceWithMetadata;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  proposalVotes: {
    totalCount: number;
    nodes: VoteWithProfile[];
  };
  // @TODO: Proposed versions
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

  const spaceConfig = proposal.space.spacesMetadata.nodes[0].entity as SubstreamEntity | undefined;
  const spaceConfigTriples = (spaceConfig?.triples.nodes ?? []).map(TripleDto);

  const spaceWithMetadata: SpaceWithMetadata = {
    id: proposal.space.id,
    name: spaceConfig?.name ?? null,
    image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
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
  };
}

export type ProposalWithoutVoters = OmitStrict<Proposal, 'proposalVotes'>;

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

  const spaceConfig = proposal.space.spacesMetadata.nodes[0].entity as SubstreamEntity | undefined;
  const spaceConfigTriples = (spaceConfig?.triples.nodes ?? []).map(TripleDto);

  const spaceWithMetadata: SpaceWithMetadata = {
    id: proposal.space.id,
    name: spaceConfig?.name ?? null,
    image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
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
