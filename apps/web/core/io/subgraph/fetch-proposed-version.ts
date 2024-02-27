import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { ProposedVersion } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { SubstreamProposedVersion, fromNetworkActions } from './network-local-mapping';

export const getProposedVersionQuery = (id: string) => `query {
  proposedVersion(id: ${JSON.stringify(id)}) {
    id
    name
    createdAt
    createdAtBlock
    createdById
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

  const maybeProfile = await fetchProfile({ address: proposedVersion.createdById });

  return {
    ...proposedVersion,
    actions: fromNetworkActions(proposedVersion.actions.nodes, proposedVersion.spaceId),
    createdBy:
      maybeProfile !== null
        ? maybeProfile[1]
        : {
            id: proposedVersion.createdById,
            name: null,
            avatarUrl: null,
            coverUrl: null,
            address: proposedVersion.createdById as `0x${string}`,
            profileLink: null,
          },
  };
}
