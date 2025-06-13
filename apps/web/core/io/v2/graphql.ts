import { Effect } from 'effect';
import { GraphQLClient } from 'graphql-request';

import { getConfig } from '~/core/environment/environment';

class GraphqlRequestError extends Error {
  readonly _tag = 'GraphqlRequestError';
}

// @TODO: Type query + variables
export function graphql<GraphqlResponse, Decoded>({
  query,
  decoder,
  variables,
  signal,
}: {
  query: string;
  decoder: (data: GraphqlResponse) => Decoded;
  variables?: Record<string, any>; // can we make this typesafe?
  signal?: AbortController['signal'];
}) {
  return Effect.gen(function* () {
    const client = new GraphQLClient(getConfig().api, {
      signal,
    });

    // This could be an effect that returns a generic error type
    // that should get handled by callers
    const data = yield* Effect.tryPromise({
      try: () => client.request<GraphqlResponse>(query, variables),
      catch: error => new GraphqlRequestError(String(error)),
    });

    return decoder(data);
  });
}
