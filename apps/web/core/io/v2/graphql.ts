import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { Effect, Either } from 'effect';
import { GraphQLClient } from 'graphql-request';

import { getConfig } from '~/core/environment/environment';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(str: string): boolean {
  return UUID_PATTERN.test(str);
}

function transformVariables<T extends Record<string, unknown>>(variables: T | undefined): T | undefined {
  if (!variables) return variables;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'string' && isUUID(value)) {
      result[key] = value.replace(/-/g, '');
    } else if (Array.isArray(value)) {
      result[key] = value.map(v => (typeof v === 'string' && isUUID(v) ? v.replace(/-/g, '') : v));
    } else if (value !== null && typeof value === 'object') {
      result[key] = transformVariables(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

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
    const client = new GraphQLClient(getConfig().api, {
      signal,
    });

    const transformedVariables = transformVariables(variables as Record<string, unknown> | undefined);

    const run = Effect.tryPromise({
      try: async () => {
        return await client.request<QueryResult<TDocument>>(query, transformedVariables);
      },
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
              url: getConfig().api,
            };
          }
        }

        return new GraphqlRequestError(String(error), errorDetails);
      },
    });

    const dataResult = yield* Effect.either(run);

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
          variables: error.request.variables,
        });
      }

      return yield* Effect.fail(error);
    }

    return decoder(dataResult.right);
  });
}
