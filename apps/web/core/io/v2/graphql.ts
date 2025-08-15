import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { Effect } from 'effect';
import { GraphQLClient } from 'graphql-request';

import { getConfig } from '~/core/environment/environment';

class GraphqlRequestError extends Error {
  readonly _tag = 'GraphqlRequestError';
}

// Type utilities for extracting types from TypedDocumentNode
type QueryResult<T> = T extends TypedDocumentNode<infer TResult, any> ? TResult : never;
type QueryVariables<T> = T extends TypedDocumentNode<any, infer TVariables> ? TVariables : never;

// Automatically infer query result and variable types from TypedDocumentNode
export function graphql<TDocument extends TypedDocumentNode<any, any>, Decoded>({
  query,
  decoder,
  variables,
  signal,
}: {
  query: TDocument;
  decoder: (data: QueryResult<TDocument>) => Decoded;
  variables?: QueryVariables<TDocument>;
  signal?: AbortController['signal'];
}) {
  return Effect.gen(function* () {
    const apiUrl = getConfig().api;
    
    const client = new GraphQLClient(apiUrl, {
      signal,
    });

    // This could be an effect that returns a generic error type
    // that should get handled by callers
    const data = yield* Effect.tryPromise({
      try: () => client.request<QueryResult<TDocument>>(query, variables),
      catch: error => new GraphqlRequestError(String(error)),
    });

    return decoder(data);
  });
}
