import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import { v4 as uuid } from 'uuid';

import { Environment } from '~/core/environment';

import { graphql } from './graphql';

const getFetchProposedEditorsQuery = (id: string) => `query {
  space(id: "${id}") {
    proposedEditors {
      nodes {
        accountId
      }
    }
  }
}`;

export interface FetchProposedEditorsOptions {
  id: string;
}

type NetworkResult = {
  space: { proposedEditors: { nodes: Array<{ accountId: string }> } } | null;
};

export async function fetchProposedEditors(options: FetchProposedEditorsOptions): Promise<string[]> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchProposedEditorsQuery(options.id),
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
            `Encountered runtime graphql error in fetchProposedEditors. queryId: ${queryId} spaceId: ${
              options.id
            } endpoint: ${endpoint}

            queryString: ${getFetchProposedEditorsQuery(options.id)}
            `,
            error.message
          );

          return { space: null };

        default:
          console.error(
            `${error._tag}: Unable to fetch proposed editors, queryId: ${queryId} spaceId: ${options.id} endpoint: ${endpoint}`
          );

          return { space: null };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  if (!result.space) {
    return [];
  }

  const proposedEditors = result.space.proposedEditors.nodes.map(node => node.accountId);

  return proposedEditors;
}
