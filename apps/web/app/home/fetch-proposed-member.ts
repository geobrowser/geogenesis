import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import { graphql } from '~/core/io/subgraph/graphql';
import { Profile } from '~/core/types';

const getProposedMemberInProposalQuery = (proposalId: string) => `query {
  proposalActionsConnection(
    first: 1
    filter: {
      proposalId: { is: "${proposalId}" }
      actionType: { in: [ADD_MEMBER] }
    }
  ) {
    nodes {
      targetId
    }
  }
}`;

interface NetworkResult {
  proposalActionsConnection: {
    nodes: {
      targetId: string | null;
    }[];
  };
}

export async function fetchProposedMemberForProposal(proposalId: string): Promise<Profile | null> {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getProposedMemberInProposalQuery(proposalId),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchProposedMember. proposalId: ${proposalId} endpoint: ${endpoint}

            queryString: ${getProposedMemberInProposalQuery(proposalId)}
            `,
            error.message
          );

          return { proposalActionsConnection: { nodes: [] } };

        default:
          console.error(
            `${error._tag}: Unable to fetch proposed member, proposalId: ${proposalId} endpoint: ${endpoint}`
          );

          return { proposalActionsConnection: { nodes: [] } };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);
  const actions = result.proposalActionsConnection.nodes;

  if (actions.length === 0 || !actions[0].targetId) {
    return null;
  }

  // targetId is the space ID of the proposed member
  const proposedMemberSpaceId = actions[0].targetId;
  return await Effect.runPromise(fetchProfileBySpaceId(proposedMemberSpaceId));
}

