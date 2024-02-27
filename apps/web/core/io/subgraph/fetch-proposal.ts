import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';
import { Proposal } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { SubstreamProposal, fromNetworkActions } from './network-local-mapping';

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

  const maybeProfile = await fetchProfile({ address: proposal.createdById });

  return {
    ...proposal,
    space: proposal.spaceId,
    createdBy:
      maybeProfile !== null
        ? maybeProfile[1]
        : {
            id: proposal.createdById,
            name: null,
            avatarUrl: null,
            coverUrl: null,
            address: proposal.createdById as `0x${string}`,
            profileLink: null,
          },
    proposedVersions: proposal.proposedVersions.nodes.map(v => {
      return {
        ...v,
        createdBy:
          maybeProfile !== null
            ? maybeProfile[1]
            : {
                id: proposal.createdById,
                name: null,
                avatarUrl: null,
                coverUrl: null,
                address: proposal.createdById as `0x${string}`,
                profileLink: null,
              },
        actions: fromNetworkActions(v.actions.nodes, proposal.spaceId),
      };
    }),
  };
}
