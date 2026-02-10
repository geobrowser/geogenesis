import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { graphql } from './graphql';

const getFetchProposedMembersQuery = (spaceId: string) => `query {
  proposalsConnection(
    filter: {
      spaceId: { is: "${spaceId}" }
      executedAt: { isNull: true }
      proposalActionsConnection: {
        some: { actionType: { in: [ADD_MEMBER] } }
      }
    }
  ) {
    nodes {
      proposalActions {
        targetId
      }
    }
  }
}`;

export interface FetchProposedMembersOptions {
  id: string;
}

type NetworkResult = {
  proposalsConnection: {
    nodes: Array<{
      proposalActions: Array<{ targetId: string | null }>;
    }>;
  };
};

export async function fetchProposedMembers(options: FetchProposedMembersOptions): Promise<string[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchProposedMembersQuery(options.id),
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
            `Encountered runtime graphql error in fetchProposedMembers. queryId: ${queryId} spaceId: ${
              options.id
            } endpoint: ${endpoint}

            queryString: ${getFetchProposedMembersQuery(options.id)}
            `,
            error.message
          );

          return { proposalsConnection: { nodes: [] } };

        default:
          console.error(
            `${error._tag}: Unable to fetch proposed members, queryId: ${queryId} spaceId: ${options.id} endpoint: ${endpoint}`
          );

          return { proposalsConnection: { nodes: [] } };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const targetIds = result.proposalsConnection.nodes.flatMap(node =>
    node.proposalActions.map(action => action.targetId).filter((id): id is string => id != null)
  );

  return targetIds;
}
