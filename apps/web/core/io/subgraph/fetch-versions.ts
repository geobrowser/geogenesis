import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Version } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { SubstreamVersion, fromNetworkActions, fromNetworkTriples } from './network-local-mapping';

const getVersionsQuery = (entityId: string, offset: number, proposalId?: string) => {
  const filter = [
    `entityId: { equalTo: ${JSON.stringify(entityId)} }`,
    proposalId && `proposedVersion: { proposalId: { equalTo: ${JSON.stringify(proposalId)} } }`,
  ]
    .filter(Boolean)
    .join(' ');

  return `query {
    versions(filter: {${filter}}, orderBy: CREATED_AT_DESC, first: 5, offset: ${offset}) {
      nodes {
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
    }
  }`;
};

export interface FetchVersionsOptions {
  entityId: string;
  proposalId?: string;
  page?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  versions: { nodes: SubstreamVersion[] };
}

export async function fetchVersions({
  entityId,
  signal,
  proposalId,
  page = 0,
}: FetchVersionsOptions): Promise<Version[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getVersionsQuery(entityId, page * 5, proposalId),
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
            `Encountered runtime graphql error in fetchVersions. queryId: ${queryId} endpoint: ${endpoint} page: ${page}
            
            queryString: ${getVersionsQuery(entityId, page * 5, proposalId)}
            `,
            error.message
          );

          return {
            versions: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch fetchVersions. queryId: ${queryId} entityId: ${entityId} endpoint: ${endpoint} page: ${page}`
          );

          return {
            versions: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const versions = result.versions.nodes;

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfiles = await Promise.all(versions.map(v => fetchProfile({ address: v.createdById })));

  // Create a map of wallet address -> profile so we can look it up when creating the application
  // ProposedVersions data structure. ProposedVersions have a `createdById` field that should map to the Profile
  // of the user who created the ProposedVersion.
  const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

  return versions.map(v => {
    const networkTriples = v.tripleVersions.nodes.map(n => n.triple);

    return {
      ...v,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profiles[v.createdById] ?? {
        id: v.createdById,
        name: null,
        avatarUrl: null,
        coverUrl: null,
        address: v.createdById as `0x${string}`,
        profileLink: null,
      },
      actions: fromNetworkActions(v.actions.nodes, v.spaceId),
      triples: fromNetworkTriples(networkTriples),
    };
  });
}
