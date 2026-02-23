import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { Duration, Effect, Either } from 'effect';
import * as Schedule from 'effect/Schedule';
import { GraphQLClient } from 'graphql-request';

import { getConfig } from '~/core/environment/environment';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 200;

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
  readonly isAbort: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    details?: { status?: number; response?: any; request?: any; isAbort?: boolean; retryAfterMs?: number }
  ) {
    super(message);
    this.status = details?.status;
    this.response = details?.response;
    this.request = details?.request;
    this.isAbort = details?.isAbort ?? false;
    this.retryAfterMs = details?.retryAfterMs;
  }
}

function getHeaderValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') {
    return null;
  }

  if ('get' in headers && typeof headers.get === 'function') {
    const value = headers.get(name) ?? headers.get(name.toLowerCase());
    return typeof value === 'string' ? value : null;
  }

  const record = headers as Record<string, unknown>;
  const rawValue = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];

  if (typeof rawValue === 'string') {
    return rawValue;
  }

  if (Array.isArray(rawValue) && typeof rawValue[0] === 'string') {
    return rawValue[0];
  }

  return null;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (/^\d+$/.test(trimmedValue)) {
    return Number.parseInt(trimmedValue, 10) * 1_000;
  }

  const parsedDate = Date.parse(trimmedValue);

  if (Number.isNaN(parsedDate)) {
    return undefined;
  }

  return Math.max(0, parsedDate - Date.now());
}

function isRetryableGraphqlError(error: GraphqlRequestError): boolean {
  if (error.isAbort) {
    return false;
  }

  if (error.status === undefined) {
    return true;
  }

  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function withRetry<T>(operation: Effect.Effect<T, GraphqlRequestError>): Effect.Effect<T, GraphqlRequestError> {
  const retrySchedule = Schedule.exponential(Duration.millis(BASE_RETRY_DELAY_MS)).pipe(
    Schedule.jittered,
    Schedule.intersect(Schedule.identity<GraphqlRequestError>()),
    Schedule.modifyDelay(([_, error], duration) => {
      if (error.retryAfterMs !== undefined) {
        return Duration.millis(error.retryAfterMs);
      }

      return duration;
    }),
    Schedule.whileInput(isRetryableGraphqlError),
    Schedule.intersect(Schedule.recurs(MAX_RETRIES))
  );

  return Effect.retry(operation, retrySchedule).pipe(
    Effect.tapError(error =>
      Effect.sync(() => {
        if (isRetryableGraphqlError(error)) {
          console.warn('[GRAPHQL] Exhausted retries');
        }
      })
    )
  );
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
          errorDetails.isAbort =
            error.name === 'AbortError' ||
            error.message.includes('signal is aborted') ||
            error.message.includes('The user aborted a request');

          // Extract status code and response from graphql-request errors
          if ('response' in error) {
            errorDetails.response = (error as any).response;
            errorDetails.status = (error as any).response?.status;
            errorDetails.retryAfterMs = parseRetryAfterMs(
              getHeaderValue((error as any).response?.headers, 'retry-after')
            );
          }

          if ('request' in error) {
            errorDetails.request = {
              query: query,
              variables: variables,
              url: getConfig().api,
            };
          }
        }

        return new GraphqlRequestError(error instanceof Error ? error.message : String(error), errorDetails);
      },
    });

    const dataResult = yield* Effect.either(withRetry(run));

    if (Either.isLeft(dataResult)) {
      const error = dataResult.left;

      // Abort errors are expected during navigation/unmount — don't log them as errors
      if (!error.isAbort) {
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
      }

      return yield* Effect.fail(error);
    }

    return decoder(dataResult.right);
  });
}
