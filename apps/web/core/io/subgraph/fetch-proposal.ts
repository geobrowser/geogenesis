import { Effect } from 'effect';

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
  data: { proposal: NetworkProposal | null };
  errors: unknown[];
}

export async function fetchProposal(options: FetchProposalOptions): Promise<Proposal | null> {
  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint: options.endpoint,
    query: getFetchProposalQuery(options.id),
    abortController: options.abortController,
  });

  // @TODO: Catch by known tag and unexpected errors
  // retries
  const graphqlFetchEffectWithErrorHandling = graphqlFetchEffect.pipe(
    Effect.catchAll(() => {
      console.error(`Unable to fetch proposal, id: ${options.id} endpoint: ${options.endpoint}`);
      return Effect.succeed({
        data: {
          proposal: null,
        },
        errors: [],
      });
    })
  );

  const result = await Effect.runPromise(graphqlFetchEffectWithErrorHandling);

  // @TODO: Fallback
  // @TODO: runtime validation of types
  // @TODO: log fail states
  if (result.errors?.length > 0) {
    console.error(
      `Encountered runtime graphql error in fetchProposal. id: ${options.id} endpoint: ${options.endpoint}
      
      queryString: ${getFetchProposalQuery(options.id)}
      `,
      result.errors
    );
    return null;
  }

  const proposal = result.data.proposal;

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
