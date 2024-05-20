import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { entityFragment, tripleFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import {
  SubstreamEntity,
  SubstreamProposal,
  fromNetworkTriples,
  getSpaceConfigFromMetadata,
} from '~/core/io/subgraph/network-local-mapping';
import { OmitStrict, Profile, Vote } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

export type ActiveProposalsForSpacesWhereEditor = Awaited<ReturnType<typeof getActiveProposalsForSpacesWhereEditor>>;

interface NetworkResult {
  proposals: {
    totalCount: number;
    nodes: OmitStrict<
      SubstreamProposal & {
        userVotes: { nodes: Vote[] };
      },
      'proposedVersions'
    >[];
  };
}

export async function getActiveProposalsForSpacesWhereEditor(
  address?: string,
  proposalType?: 'membership' | 'content'
) {
  if (!address) {
    return {
      totalCount: 0,
      proposals: [],
    };
  }

  let proposalTypeFilter: string | null = null;

  if (proposalType === 'content') {
    proposalTypeFilter = `or: [{
      type: { equalTo: CONTENT }
    }, {
      type: { equalTo: ADD_SUBSPACE }
    }, {
      type: { equalTo: REMOVE_SUBSPACE }
    }]`;
  }

  if (proposalType === 'membership') {
    proposalTypeFilter = `or: [{
      type: { equalTo: ADD_EDITOR }
    }, {
      type: { equalTo: ADD_MEMBER }
    }, {
      type: { equalTo: REMOVE_EDITOR }
    }, {
      type: { equalTo: REMOVE_MEMBER }
    }]`;
  }

  const substreamQuery = `query {
    proposals(
      first: 10
      orderBy: CREATED_AT_DESC
      filter: {
        ${proposalTypeFilter ?? ''}
        status: { equalTo: PROPOSED }
        endTime: { greaterThanOrEqualTo: ${Math.floor(Date.now() / 1000)} }
        space: {
          spaceEditors: {
            some: {
              accountId: { equalTo: "${address}" }
            }
          }
        }
      }
    ) {
      totalCount
      nodes {
        id
        type
        onchainProposalId
        name
        space {
          id
          metadata {
            nodes {
              ${entityFragment}
            }
          }
        }
        
        createdAtBlock
        createdBy {
          id
          onchainProfiles {
            nodes {
              homeSpaceId
              id
            }
          }
          geoProfiles {
            nodes {
              id
              name
              triples(filter: {isStale: {equalTo: false}}) {
                nodes {
                  ${tripleFragment}
                }
              }
            }
          }
        }
        createdAt
        startTime
        endTime
        status
  
        proposalVotes {
          totalCount
          nodes {
            vote
            accountId
          }
        }
  
        userVotes: proposalVotes(
          filter: {
            accountId: { equalTo: "${address ?? ''}" }
          }
        ) {
          nodes {
            vote
            accountId
          }
        }
      }
    }
  }`;

  const permissionlessSpacesEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: substreamQuery,
  });

  const proposalsInSpacesWhereEditor = await Effect.runPromise(Effect.either(permissionlessSpacesEffect));

  if (Either.isLeft(proposalsInSpacesWhereEditor)) {
    const error = proposalsInSpacesWhereEditor.left;

    switch (error._tag) {
      case 'GraphqlRuntimeError':
        console.error(`Encountered runtime graphql error in getSpacesWhereEditor.`, error.message);
        break;

      default:
        console.error(`${error._tag}: Unable to fetch spaces where editor controller`);
        break;
    }

    return {
      totalCount: 0,
      proposals: [],
    };
  }

  const result = await Effect.runPromise(proposalsInSpacesWhereEditor);
  const proposals = result.proposals.nodes;

  return {
    totalCount: result.proposals.totalCount,
    proposals: proposals.map(p => {
      const spaceConfigWithImage = getSpaceConfigFromMetadata(p.space.id, p.space.metadata.nodes[0]);
      const maybeProfile = p.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
      const onchainProfile = p.createdBy.onchainProfiles.nodes[0] as { homeSpaceId: string; id: string } | undefined;
      const profileTriples = fromNetworkTriples(maybeProfile?.triples.nodes ?? []);

      const profile: Profile = maybeProfile
        ? {
            id: p.createdBy.id,
            address: p.createdBy.id as `0x${string}`,
            avatarUrl: Entity.avatar(profileTriples),
            coverUrl: Entity.cover(profileTriples),
            name: maybeProfile.name,
            profileLink: onchainProfile ? NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id) : null,
          }
        : {
            id: p.createdBy.id,
            name: null,
            avatarUrl: null,
            coverUrl: null,
            address: p.createdBy.id as `0x${string}`,
            profileLink: null,
          };

      return {
        ...p,
        createdBy: profile,
        space: spaceConfigWithImage,
      };
    }),
  };
}
