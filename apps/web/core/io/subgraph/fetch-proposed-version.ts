import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Profile, ProposedVersion } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { graphql } from './graphql';
import {
  SubstreamEntity,
  SubstreamProposedVersion,
  fromNetworkActions,
  fromNetworkTriples,
} from './network-local-mapping';

export const getProposedVersionQuery = (id: string) => `query {
  proposedVersion(id: ${JSON.stringify(id)}) {
    id
    name
    createdAt
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

    spaceId
    actions {
      nodes {
        actionType
        id
        attribute {
          id
          name
        }
        entity {
          id
          name
        }
        entityValue
        numberValue
        stringValue
        valueType
        valueId
      }
    }
  }
}`;

export interface FetchProposedVersionOptions {
  id: string;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  proposedVersion: SubstreamProposedVersion | null;
}

export async function fetchProposedVersion({
  id,
  signal,
}: FetchProposedVersionOptions): Promise<ProposedVersion | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getProposedVersionQuery(id),
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
            `Encountered runtime graphql error in proposedVersion. queryId: ${queryId} id: ${id} endpoint: ${endpoint}
            
            queryString: ${getProposedVersionQuery(id)}
            `,
            error.message
          );

          return {
            proposedVersion: null,
          };
        default:
          console.error(
            `${error._tag}: Unable to fetch proposedVersion. queryId: ${queryId} id: ${id} endpoint: ${endpoint}`
          );

          return {
            proposedVersion: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposedVersion = result.proposedVersion;

  if (!proposedVersion) {
    return null;
  }

  const maybeProfile = proposedVersion.createdBy.geoProfiles.nodes[0] as SubstreamEntity | undefined;
  const onchainProfile = proposedVersion.createdBy.onchainProfiles.nodes[0] as
    | { homeSpaceId: string; id: string }
    | undefined;
  const profileTriples = fromNetworkTriples(maybeProfile?.triplesByEntityId.nodes ?? []);

  const profile: Profile = maybeProfile
    ? {
        id: proposedVersion.createdBy.id,
        address: proposedVersion.createdBy.id as `0x${string}`,
        avatarUrl: Entity.avatar(profileTriples),
        coverUrl: Entity.cover(profileTriples),
        name: maybeProfile.name,
        profileLink: onchainProfile ? NavUtils.toEntity(onchainProfile.homeSpaceId, onchainProfile.id) : null,
      }
    : {
        id: proposedVersion.createdBy.id,
        name: null,
        avatarUrl: null,
        coverUrl: null,
        address: proposedVersion.createdBy.id as `0x${string}`,
        profileLink: null,
      };

  return {
    ...proposedVersion,
    actions: fromNetworkActions(proposedVersion.actions.nodes, proposedVersion.spaceId),
    createdBy: profile,
  };
}
