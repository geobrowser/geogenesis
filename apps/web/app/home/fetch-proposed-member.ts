import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamTriple, fromNetworkTriples } from '~/core/io/subgraph/network-local-mapping';
import { Profile } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

const getProposedMemberInProposalQuery = (proposalId: string) => `query {
  proposedMembers(
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
            triplesByEntityId {
              nodes {
                id
                attribute {
                  id
                  name
                }
                entity {
                  id
                  name
                }
                entityValue {
                  id
                  name
                }
                numberValue
                stringValue
                valueType
                valueId
                space {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
}`;

interface NetworkResult {
  proposedMembers: {
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
            triplesByEntityId: SubstreamTriple[];
          }[];
        };
      };
    }[];
  };
}

export async function fetchProposedMemberForProposal(proposalId: string): Promise<Profile | null> {
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getProposedMemberInProposalQuery(proposalId),
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
            `Encountered runtime graphql error in fetchProposedSubspace. proposalId: ${proposalId} endpoint: ${endpoint}

            queryString: ${getProposedMemberInProposalQuery(proposalId)}
            `,
            error.message
          );

          return {
            proposedMembers: {
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch subspace, proposalId: ${proposalId} endpoint: ${endpoint}`);

          return {
            proposedMembers: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposedMembers = result.proposedMembers.nodes;

  if (proposedMembers.length === 0) {
    return null;
  }

  // There should only be one proposed member in a single proposal
  const proposedMemberAccount = proposedMembers[0].account;
  const onchainProfiles = proposedMemberAccount.onchainProfiles.nodes;
  const proposedMemberProfiles = proposedMemberAccount.geoProfiles.nodes;

  if (proposedMemberProfiles.length === 0 || onchainProfiles.length === 0) {
    return {
      id: proposedMemberAccount.id,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      address: proposedMemberAccount.id as `0x${string}`,
      profileLink: null,
    };
  }

  const profile = proposedMemberProfiles[0];
  const onchainProfile = onchainProfiles[0];
  const triples = fromNetworkTriples(profile.triplesByEntityId);

  return {
    id: profile.id,
    name: profile.name,
    avatarUrl: Entity.avatar(triples) ?? null,
    coverUrl: Entity.cover(triples) ?? null,
    address: proposedMemberAccount.id as `0x${string}`,
    profileLink: NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id),
  };
}
