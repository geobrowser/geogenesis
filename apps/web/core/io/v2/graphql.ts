import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { Effect } from 'effect';
import { GraphQLClient } from 'graphql-request';

import { getConfig } from '~/core/environment/environment';

class GraphqlRequestError extends Error {
  readonly _tag = 'GraphqlRequestError';
}

// Properly typed query + variables with inference
export function graphql<TResult, TVariables extends Record<string, any>, Decoded>({
  query,
  decoder,
  variables,
  signal,
}: {
  query: TypedDocumentNode<TResult, TVariables>;
  decoder: (data: TResult) => Decoded;
  variables?: TVariables;
  signal?: AbortController['signal'];
}) {
  return Effect.gen(function* () {
    const client = new GraphQLClient(getConfig().api, {
      signal,
    });

    // This could be an effect that returns a generic error type
    // that should get handled by callers
    const data = yield* Effect.tryPromise({
      try: () => client.request<TResult>(query, variables),
      catch: error => new GraphqlRequestError(String(error)),
    });

    return decoder(data);
  });
}
