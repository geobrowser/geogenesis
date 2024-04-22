import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { Profile, Proposal, SpaceWithMetadata } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { graphql } from './graphql';
import { SubstreamEntity, SubstreamProposal, fromNetworkActions, fromNetworkTriples } from './network-local-mapping';

export const getFetchProposalQuery = (id: string) => `query {
  proposal(id: ${JSON.stringify(id)}) {
    id
    onchainProposalId
    name
    spaceId
    createdAtBlock
    createdById
    createdAt
    status

    createdBy {
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
              isProtected
              space {
                id
              }
            }
          }
        }
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
}`;

export interface FetchProposalOptions {
  id: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  proposal: SubstreamProposal | null;
}

export async function fetchProposal(options: FetchProposalOptions): Promise<Proposal | null> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api,
    query: getFetchProposalQuery(options.id),
    signal: options?.signal,
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
            `Encountered runtime graphql error in fetchProposal. queryId: ${queryId} id: ${options.id}
            
            queryString: ${getFetchProposalQuery(options.id)}
            `,
            error.message
          );

          return {
            proposal: null,
          };
        default:
          console.error(`${error._tag}: Unable to fetch proposal, queryId: ${queryId} id: ${options.id}`);
          return {
            proposal: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const proposal = result.proposal;

  if (!proposal) {
    return null;
  }

  const maybeProfile = proposal.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
  const onchainProfile = proposal.createdBy.onchainProfiles.nodes[0] as { homeSpaceId: string; id: string } | undefined;
  const profileTriples = fromNetworkTriples(maybeProfile?.triplesByEntityId.nodes ?? []);

  const profile: Profile = maybeProfile
    ? {
        id: proposal.createdBy.id,
        address: proposal.createdBy.id as `0x${string}`,
        avatarUrl: Entity.avatar(profileTriples),
        coverUrl: Entity.cover(profileTriples),
        name: maybeProfile.name,
        profileLink: onchainProfile ? NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id) : null,
      }
    : {
        id: proposal.createdBy.id,
        name: null,
        avatarUrl: null,
        coverUrl: null,
        address: proposal.createdBy.id as `0x${string}`,
        profileLink: null,
      };

  const spaceConfig = proposal.space.metadata.nodes[0] as SubstreamEntity | undefined;
  const spaceConfigTriples = fromNetworkTriples(spaceConfig?.triplesByEntityId.nodes ?? []);

  const spaceWithMetadata: SpaceWithMetadata = {
    id: proposal.space.id,
    name: spaceConfig?.name ?? null,
    image: Entity.avatar(spaceConfigTriples) ?? Entity.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
  };

  return {
    ...proposal,
    space: spaceWithMetadata,
    createdBy: profile,
    proposedVersions: proposal.proposedVersions.nodes.map(v => {
      return {
        ...v,
        createdBy: profile,
        space: spaceWithMetadata,
        actions: fromNetworkActions(v.actions.nodes, proposal.space.id),
      };
    }),
  };
}
