import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Proposal } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { SubstreamProposal, fromNetworkActions } from './network-local-mapping';

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
      createdById
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

  // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
  // of the user and fetch the Profile for the user with the matching wallet address.
  const maybeProfiles = await Promise.all(proposals.map(v => fetchProfile({ address: v.createdById })));

  // Create a map of wallet address -> profile so we can look it up when creating the application
  // ProposedVersions data structure. ProposedVersions have a `createdBy` field that should map to the Profile
  // of the user who created the ProposedVersion.
  const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

  return proposals.map(p => {
    return {
      ...p,
      name: p.name,
      description: p.description,
      space: p.spaceId,
      // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
      createdBy: profiles[p.createdById] ?? {
        id: p.createdById,
        name: null,
        avatarUrl: null,
        coverUrl: null,
        address: p.createdById as `0x${string}`,
        profileLink: null,
      },
      proposedVersions: p.proposedVersions.nodes.map(v => {
        return {
          ...v,
          createdBy: profiles[p.createdById] ?? {
            id: p.createdById,
            name: null,
            avatarUrl: null,
            coverUrl: null,
            address: p.createdById as `0x${string}`,
            profileLink: null,
          },
          actions: fromNetworkActions(v.actions.nodes, spaceId),
        };
      }),
    };
  });
}
