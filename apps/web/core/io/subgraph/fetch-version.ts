import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Version } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { SubstreamVersion, fromNetworkActions, fromNetworkTriples } from './network-local-mapping';

const getVersionsQuery = (versionId: string) => `query {
  version(id: ${JSON.stringify(versionId)}) {
      id
      name
      createdAt
      createdAtBlock
      createdById
      spaceId
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
          entityValue
          numberValue
          stringValue
          valueType
          valueId
        }
      }
      tripleVersions {
        nodes {
          triple {
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
}`;

export interface FetchVersionsOptions {
  versionId: string;
  page?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  version: SubstreamVersion | null;
}

export async function fetchVersion({ versionId, signal, page = 0 }: FetchVersionsOptions): Promise<Version | null> {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getVersionsQuery(versionId),
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
            `Encountered runtime graphql error in fetchVersion. queryId: ${queryId} versionId: ${versionId} endpoint: ${endpoint} page: ${page}
            
            queryString: ${getVersionsQuery(versionId)}
            `,
            error.message
          );

          return {
            version: null,
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch fetchVersion. queryId: ${queryId} versionId: ${versionId} endpoint: ${endpoint} page: ${page}`
          );

          return {
            version: null,
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const version = result.version;

  if (!version) {
    return null;
  }

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfile = await fetchProfile({ address: version.createdById });
  const networkTriples = version.tripleVersions.nodes.map(n => n.triple);
  const spaceId = version.spaceId;

  return {
    ...version,
    // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
    createdBy: maybeProfile
      ? maybeProfile[1]
      : {
          id: version.createdById,
          name: null,
          avatarUrl: null,
          coverUrl: null,
          address: version.createdById as `0x${string}`,
          profileLink: null,
        },
    actions: fromNetworkActions(version.actions.nodes, spaceId),
    triples: fromNetworkTriples(networkTriples),
  };
}
