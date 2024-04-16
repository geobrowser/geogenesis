import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { ProposedVersion } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { SubstreamProposedVersion, fromNetworkActions } from './network-local-mapping';

const getProposedVersionsQuery = (entityId: string, skip: number) => `query {
  proposedVersions(filter: {entityId: {equalTo: ${JSON.stringify(
    entityId
  )}}}, orderBy: CREATED_AT_DESC, first: 10, offset: ${skip}) {
    nodes {
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
  }
}`;

export interface FetchProposedVersionsOptions {
  entityId: string;
  spaceId: string;
  page?: number;
  signal?: AbortController['signal'];
}

interface NetworkResult {
  proposedVersions: { nodes: SubstreamProposedVersion[] };
}

export async function fetchProposedVersions({
  entityId,
  spaceId,
  signal,
  page = 0,
}: FetchProposedVersionsOptions): Promise<ProposedVersion[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getProposedVersionsQuery(entityId, page * 10),
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
            `Encountered runtime graphql error in fetchProposedVersions. queryId: ${queryId} spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}
            
            queryString: ${getProposedVersionsQuery(entityId, page * 10)}
            `,
            error.message
          );

          return {
            proposedVersions: { nodes: [] },
          };

        default:
          console.error(
            `${error._tag}: Unable to fetch proposedVersions. queryId: ${queryId} entityId: ${entityId} spaceId: ${spaceId} endpoint: ${endpoint} page: ${page}`
          );

          return {
            proposedVersions: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const proposedVersions = result.proposedVersions.nodes;

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfiles = await Promise.all(proposedVersions.map(v => fetchProfile({ address: v.createdById })));

  // Create a map of wallet address -> profile so we can look it up when creating the application
  // ProposedVersions data structure. ProposedVersions have a `createdById` field that should map to the Profile
  // of the user who created the ProposedVersion.
  const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

  return proposedVersions.map(v => {
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
      actions: fromNetworkActions(v.actions.nodes, spaceId),
    };
  });
}
