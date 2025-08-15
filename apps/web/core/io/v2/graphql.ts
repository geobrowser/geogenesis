import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { Effect, Either } from 'effect';
import { GraphQLClient } from 'graphql-request';

import { getConfig } from '~/core/environment/environment';

class GraphqlRequestError extends Error {
  readonly _tag = 'GraphqlRequestError';
  readonly status?: number;
  readonly response?: any;
  readonly request?: any;

  constructor(message: string, details?: { status?: number; response?: any; request?: any }) {
    super(message);
    this.status = details?.status;
    this.response = details?.response;
    this.request = details?.request;
  }
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
    const run = Effect.tryPromise({
      try: () => client.request<QueryResult<TDocument>>(query, variables),
      catch: error => {
        const errorDetails: any = {};
        
        if (error instanceof Error) {
          errorDetails.message = error.message;
          
          // Extract status code and response from graphql-request errors
          if ('response' in error) {
            errorDetails.response = (error as any).response;
            errorDetails.status = (error as any).response?.status;
          }
          
          if ('request' in error) {
            errorDetails.request = {
              query: query,
              variables: variables,
              url: getConfig().api
            };
          }
        }
        
        return new GraphqlRequestError(
          String(error),
          errorDetails
        );
      },
    });

    const dataResult = yield* Effect.either(run)

    if (Either.isLeft(dataResult)) {
      const error = dataResult.left;
      console.error('GraphQL request failed:', error.message);
      
      if (error.status) {
        console.error('Status code:', error.status);
      }
      
      if (error.response) {
        console.error('Response:', error.response);
      }
      
      if (error.request) {
        console.error('Request details:', {
          url: error.request.url,
          query: error.request.query,
          variables: error.request.variables
        });
      }
      
      return yield* Effect.fail(error);
    }

    return decoder(dataResult.right);
  });
}
