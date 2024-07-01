import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { tripleFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamTriple, fromNetworkTriples } from '~/core/io/subgraph/network-local-mapping';
import { Profile } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

const getProposedEditorInProposalQuery = (proposalId: string) => `query {
  proposedEditors(
    first: 1
    filter: { proposalId: { equalTo: "${proposalId}" } }
  ) {
    nodes {
      account {
        id

        onchainProfiles {
          nodes {
            id
            homeSpaceId
          }
        }

        geoProfiles {
          nodes {
            id
            name
            triples {
              nodes {
                ${tripleFragment}
              }
            }
          }
        }
      }
    }
  }
}`;

interface NetworkResult {
  proposedEditors: {
    nodes: {
      account: {
        id: string;
        onchainProfiles: {
          nodes: {
            id: string;
            homeSpaceId: string;
          }[];
        };
        geoProfiles: {
          nodes: {
            id: string;
            name: string;
            triples: SubstreamTriple[];
          }[];
        };
      };
    }[];
  };
}

export async function fetchProposedEditorForProposal(proposalId: string): Promise<Profile | null> {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getProposedEditorInProposalQuery(proposalId),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
          // the caller to consume the error channel as an effect. We throw here the typical JS
          // way so we don't infect more of the codebase with the effect runtime.
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchProposedMember. proposalId: ${proposalId} endpoint: ${endpoint}

            queryString: ${getProposedEditorInProposalQuery(proposalId)}
            `,
            error.message
          );

          return {
            proposedEditors: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch subspace, proposalId: ${proposalId} endpoint: ${endpoint}`);

          return {
            proposedEditors: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposedEditors = result.proposedEditors.nodes;

  if (proposedEditors.length === 0) {
    return null;
  }

  // There should only be one proposed member in a single proposal
  const proposedEditorAccount = proposedEditors[0].account;
  const onchainProfiles = proposedEditorAccount.onchainProfiles.nodes;
  const proposedEditorProfiles = proposedEditorAccount.geoProfiles.nodes;

  if (proposedEditorProfiles.length === 0 || onchainProfiles.length === 0) {
    return {
      id: proposedEditorAccount.id,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      address: proposedEditorAccount.id as `0x${string}`,
      profileLink: null,
    };
  }

  const profile = proposedEditorProfiles[0];
  const onchainProfile = onchainProfiles[0];
  const triples = fromNetworkTriples(profile.triples);

  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: Entities.avatar(triples) ?? null,
    coverUrl: Entities.cover(triples) ?? null,
    address: proposedEditorAccount.id as `0x${string}`,
    profileLink: NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id),
  };
}
