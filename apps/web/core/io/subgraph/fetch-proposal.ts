import { Effect } from 'effect';
import { v4 as uuid } from 'uuid';

import { Proposal } from '~/core/types';

import { fetchProfile } from './fetch-profile';
import { graphql } from './graphql';
import { NetworkProposal, fromNetworkActions } from './network-local-mapping';

export const getFetchProposalQuery = (id: string) => `query {
  proposal(id: ${JSON.stringify(id)}) {
    id
    name
    description
    createdAt
    createdAtBlock
    createdBy {
      id
    }
    status
    proposedVersions {
      id
      name
      createdAt
      createdBy {
        id
      }
      actions {
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
}`;

export interface FetchProposalOptions {
  endpoint: string;
  id: string;
  abortController?: AbortController;
}

interface NetworkResult {
  proposal: NetworkProposal | null;
}

export async function fetchProposal(options: FetchProposalOptions): Promise<Proposal | null> {
  const queryId = uuid();

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchProposalQuery(options.id),
    abortController: options.abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchTag('GraphqlRuntimeError', error => {
      console.error(
        `Encountered runtime graphql error in fetchProposal. queryId: ${queryId} id: ${options.id} endpoint: ${
          options.endpoint
        }
        
        queryString: ${getFetchProposalQuery(options.id)}
        `,
        error.message
      );

      return Effect.succeed({
        proposal: null,
      });
    }),
    Effect.catchAll(() => {
      console.error(`Unable to fetch proposal, queryId: ${queryId} id: ${options.id} endpoint: ${options.endpoint}`);
      return Effect.succeed({
        proposal: null,
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  const proposal = result.proposal;

  if (!proposal) {
    return null;
  }

  const maybeProfile = await fetchProfile({ address: proposal.createdBy.id, endpoint: options.endpoint });

  return {
    ...proposal,
    createdBy: maybeProfile !== null ? maybeProfile[1] : proposal.createdBy,
    proposedVersions: proposal.proposedVersions.map(v => {
      return {
        ...v,
        createdBy: maybeProfile !== null ? maybeProfile[1] : proposal.createdBy,
        actions: fromNetworkActions(v.actions, proposal.space),
      };
    }),
  };
}
