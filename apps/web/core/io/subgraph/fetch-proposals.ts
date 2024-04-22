import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Profile, Proposal } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { graphql } from './graphql';
import { SubstreamEntity, SubstreamProposal, fromNetworkActions, fromNetworkTriples } from './network-local-mapping';

const getFetchSpaceProposalsQuery = (spaceId: string, first: number, skip: number) => `query {
  proposals(first: ${first}, filter: {spaceId: {equalTo: ${JSON.stringify(
    spaceId
  )}}}, orderBy: CREATED_AT_DESC, offset: ${skip}) {
    nodes {
      id
      onchainProposalId
      name
      spaceId
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
                isProtected
                space {
                  id
                }
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
        }
      }

      proposedVersions {
        nodes {
          id
          name
          createdById
          entity {
            id
            name
          }
          actions {
            nodes {
              id
              actionType
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
            }
          }
        }
      }
    }
  }
}`;

export interface FetchProposalsOptions {
  spaceId: string;
  signal?: AbortController['signal'];
  page?: number;
  first?: number;
  tag?: string;
}

interface NetworkResult {
  proposals: { nodes: SubstreamProposal[] };
}

export async function fetchProposals({
  spaceId,
  signal,
  page = 0,
  first = 5,
  tag,
}: FetchProposalsOptions): Promise<Proposal[]> {
  const queryId = uuid();
  const offset = page * first;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: getFetchSpaceProposalsQuery(spaceId, first, offset),
    signal,
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
            `Encountered runtime graphql error in fetchProposals. queryId: ${queryId} spaceId: ${spaceId} page: ${page}
            
            queryString: ${getFetchSpaceProposalsQuery(spaceId, first, offset)}
            `,
            error.message
          );
          return {
            proposals: {
              nodes: [],
            },
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposals, queryId: ${queryId} spaceId: ${spaceId} page: ${page}`
          );
          return {
            proposals: {
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposals = result.proposals.nodes;

  return proposals.map(p => {
    const maybeProfile = p.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
    const onchainProfile = p.createdBy.onchainProfiles.nodes[0] as { homeSpaceId: string; id: string } | undefined;
    const profileTriples = fromNetworkTriples(maybeProfile?.triplesByEntityId.nodes ?? []);

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
      name: p.name,
      description: p.description,
      space: p.spaceId,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profile,
      proposedVersions: p.proposedVersions.nodes.map(v => {
        return {
          ...v,
          createdBy: profile,
          actions: fromNetworkActions(v.actions.nodes, spaceId),
        };
      }),
    };
  });
}
