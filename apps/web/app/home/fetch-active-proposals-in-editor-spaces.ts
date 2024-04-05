import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { fetchProfile } from '~/core/io/subgraph';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamProposal } from '~/core/io/subgraph/network-local-mapping';
import { OmitStrict, Vote } from '~/core/types';

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
    proposalTypeFilter = `type: { equalTo: CONTENT }`;
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
          spaceEditorsV2s: {
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
        spaceId
        createdAtBlock
        createdById
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

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfiles = await Promise.all(proposals.map(v => fetchProfile({ address: v.createdById })));

  // Create a map of wallet address -> profile so we can look it up when creating the application
  // ProposedVersions data structure. ProposedVersions have a `createdBy` field that should map to the Profile
  // of the user who created the ProposedVersion.
  const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

  return {
    totalCount: result.proposals.totalCount,
    proposals: proposals.map(p => {
      return {
        ...p,
        // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
        createdBy: profiles[p.createdById] ?? {
          id: p.createdById,
          name: null,
          avatarUrl: null,
          coverUrl: null,
          address: p.createdById as `0x${string}`,
          profileLink: null,
        },
      };
    }),
  };
}
