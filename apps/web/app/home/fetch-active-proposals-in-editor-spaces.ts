import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { ProposalDto } from '~/core/io/dto/proposals';
import { SubstreamProposal } from '~/core/io/schema';
import { fetchProfilesByAddresses } from '~/core/io/subgraph/fetch-profiles-by-ids';
import { spaceMetadataFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';

export type ActiveProposalsForSpacesWhereEditor = Awaited<ReturnType<typeof getActiveProposalsForSpacesWhereEditor>>;

interface NetworkResult {
  proposals: {
    totalCount: number;
    nodes: SubstreamProposal[];
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
      type: { equalTo: ADD_EDIT }
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
        # Show all the proposals for now so users can execute them manually
        # endTime: { greaterThanOrEqualTo: ${Math.floor(Date.now() / 1000)} }
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
          spacesMetadata {
            nodes {
              entity {
                id
                currentVersion {
                  version {
                    ${spaceMetadataFragment}
                  }
                }
              }
            }
          }
        }

        createdAtBlock
        createdBy {
          id
        }
        createdAt
        startTime
        endTime
        status

        proposalVotes {
          totalCount
          nodes {
            vote
            account {
              id
            }
          }
        }
      }
    }
  }`;

  const permissionlessSpacesEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig().api,
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
  const profilesForProposals = await fetchProfilesByAddresses(proposals.map(p => p.createdById));

  return {
    totalCount: result.proposals.totalCount,
    proposals: proposals
      .map(p => {
        const decodedProposal = Schema.decodeEither(SubstreamProposal)(p);
        const maybeProfile = profilesForProposals.find(profile => profile.address === p.createdById);

        const proposal = Either.match(decodedProposal, {
          onLeft: error => {
            console.error(
              `Encountered error decoding active proposal for editor space with id ${p.space.id} – error: ${error}`
            );
            return null;
          },
          onRight: space => {
            return space;
          },
        });

        if (proposal === null) {
          return null;
        }

        return ProposalDto(proposal, maybeProfile, []);
      })
      .filter(p => p !== null),
  };
}
