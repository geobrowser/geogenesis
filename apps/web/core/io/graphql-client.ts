import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { Duration, Effect, Either } from 'effect';
import * as Schedule from 'effect/Schedule';
import { GraphQLClient } from 'graphql-request';

import {
  classifyTransportFailure,
  isIngressUnavailableHtml,
  isRetryableCategory,
  parseRetryAfterMs,
  type RetryCategory,
  withRetryAfterJitter,
} from './errors/retry-utils';
import { getConfig } from '~/core/environment/environment';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 200;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

function getOperationName(document: TypedDocumentNode<any, any>): string | undefined {
  const op = document.definitions.find(def => def.kind === 'OperationDefinition');
  if (!op || op.kind !== 'OperationDefinition') {
    return undefined;
  }

  return op.name?.value;
}

function summarizeResponseForLog(response: any) {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const body = (response as any).body;
  const errors = (response as any).errors;

  return {
    status: typeof (response as any).status === 'number' ? (response as any).status : undefined,
    hasErrors: Array.isArray(errors) ? errors.length > 0 : undefined,
    errorsCount: Array.isArray(errors) ? errors.length : undefined,
    bodyLength: typeof body === 'string' ? body.length : undefined,
  };
}

class GraphqlRequestError extends Error {
  readonly _tag = 'GraphqlRequestError';
  readonly status?: number;
  readonly response?: any;
  readonly request?: any;
  readonly isAbort: boolean;
  readonly retryAfterMs?: number;
  readonly retryCategory?: RetryCategory;
  readonly source?: 'api' | 'ingress' | 'unknown';
  readonly requestId?: string;
  readonly clientRequestId?: string;
  readonly transportCode?: string;
  readonly transportErrno?: string;
  readonly transportSyscall?: string;

  constructor(
    message: string,
    details?: {
      status?: number;
      response?: any;
      request?: any;
      isAbort?: boolean;
      retryAfterMs?: number;
      retryCategory?: RetryCategory;
      source?: 'api' | 'ingress' | 'unknown';
      requestId?: string;
      clientRequestId?: string;
      transportCode?: string;
      transportErrno?: string;
      transportSyscall?: string;
    }
  ) {
    super(message);
    this.status = details?.status;
    this.response = details?.response;
    this.request = details?.request;
    this.isAbort = details?.isAbort ?? false;
    this.retryAfterMs = details?.retryAfterMs;
    this.retryCategory = details?.retryCategory;
    this.source = details?.source;
    this.requestId = details?.requestId;
    this.clientRequestId = details?.clientRequestId;
    this.transportCode = details?.transportCode;
    this.transportErrno = details?.transportErrno;
    this.transportSyscall = details?.transportSyscall;
  }
}

type GraphqlRetryLogContext = {
  category: RetryCategory;
  status?: number;
  source?: 'api' | 'ingress' | 'unknown';
  requestId?: string;
  clientRequestId: string;
  retryAfterMs?: number;
  transportCode?: string;
  transportErrno?: string;
  transportSyscall?: string;
};

function toGraphqlRetryLogContext(
  error: GraphqlRequestError,
  fallbackClientRequestId: string
): GraphqlRetryLogContext {
  return {
    category: error.retryCategory ?? (error.status === undefined ? 'transport_unknown' : 'http_5xx_other'),
    status: error.status,
    source: error.source,
    requestId: error.requestId,
    clientRequestId: error.clientRequestId ?? fallbackClientRequestId,
    retryAfterMs: error.retryAfterMs,
    transportCode: error.transportCode,
    transportErrno: error.transportErrno,
    transportSyscall: error.transportSyscall,
  };
}

function classifyStatusCategory(status: number, source: 'api' | 'ingress' | 'unknown', body: string): RetryCategory {
  const normalizedBody = body.toLowerCase();
  if (status === 503 && normalizedBody.includes('database temporarily overloaded')) {
    return 'http_503_api_overloaded';
  }

  if (status === 503 && source === 'ingress') {
    return 'http_503_ingress_unavailable';
  }

  if (status === 429) {
    return 'http_429';
  }

  if (status === 408) {
    return 'http_408';
  }

  if (status >= 500) {
    return 'http_5xx_other';
  }

  return 'http_4xx_non_retryable';
}

function detectResponseSource(contentType: string | null, body: string): 'api' | 'ingress' | 'unknown' {
  const normalizedContentType = (contentType ?? '').toLowerCase();

  if (isIngressUnavailableHtml(contentType, body)) {
    return 'ingress';
  }

  if (normalizedContentType.includes('application/json')) {
    return 'api';
  }

  return 'unknown';
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

function isRetryableGraphqlError(error: GraphqlRequestError): boolean {
  if (error.isAbort) {
    return false;
  }

  if (error.retryCategory !== undefined) {
    return isRetryableCategory(error.retryCategory);
  }

  if (error.status === undefined) {
    return false;
  }

  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function withRetry<T>(
  operation: Effect.Effect<T, GraphqlRequestError>,
  context: { operationName?: string; clientRequestId: string }
): Effect.Effect<T, GraphqlRequestError> {
  const retrySchedule = Schedule.exponential(Duration.millis(BASE_RETRY_DELAY_MS)).pipe(
    Schedule.jittered,
    Schedule.intersect(Schedule.identity<GraphqlRequestError>()),
    Schedule.modifyDelay(([_, error], duration) => {
      if (error.retryAfterMs !== undefined) {
        return Duration.millis(withRetryAfterJitter(error.retryAfterMs));
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
          const retryLogContext = toGraphqlRetryLogContext(error, context.clientRequestId);

          console.warn('[GRAPHQL] Exhausted retries', {
            operationName: context.operationName,
            clientRequestId: retryLogContext.clientRequestId,
            category: retryLogContext.category,
            status: retryLogContext.status,
            source: retryLogContext.source,
            requestId: retryLogContext.requestId,
            retryAfterMs: retryLogContext.retryAfterMs,
            maxRetries: MAX_RETRIES,
            transportCode: retryLogContext.transportCode,
            transportErrno: retryLogContext.transportErrno,
            transportSyscall: retryLogContext.transportSyscall,
            correlationHint: `graphql clientRequestId=${retryLogContext.clientRequestId} requestId=${retryLogContext.requestId ?? 'unknown'} operation=${context.operationName ?? 'unknown'}`,
          });
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
    const clientRequestId = createClientRequestId();
    const operationName = getOperationName(query);

    const client = new GraphQLClient(getConfig().api, {
      signal,
      headers: {
        'x-request-id': clientRequestId,
        'x-correlation-id': clientRequestId,
      },
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
            const contentType = getHeaderValue((error as any).response?.headers, 'content-type');
            const body =
              typeof (error as any).response?.body === 'string'
                ? (error as any).response.body
                : JSON.stringify((error as any).response?.errors ?? (error as any).response ?? '');
            const source = detectResponseSource(contentType, body);
            errorDetails.source = source;
            errorDetails.requestId = getHeaderValue((error as any).response?.headers, 'x-request-id') ?? undefined;
            errorDetails.clientRequestId = clientRequestId;
            errorDetails.retryCategory =
              typeof errorDetails.status === 'number'
                ? classifyStatusCategory(errorDetails.status, source, body)
                : undefined;
          }

          if (errorDetails.status === undefined) {
            const transport = classifyTransportFailure(error);
            errorDetails.retryCategory = transport.category;
            errorDetails.clientRequestId = clientRequestId;
            errorDetails.transportCode = transport.code;
            errorDetails.transportErrno = transport.errno;
            errorDetails.transportSyscall = transport.syscall;
          }

          if ('request' in error) {
            errorDetails.request = {
              operationName,
              variableKeys: variables ? Object.keys(variables as Record<string, unknown>) : [],
              url: getConfig().api,
              clientRequestId,
            };
          }
        }

        return new GraphqlRequestError(error instanceof Error ? error.message : String(error), errorDetails);
      },
    });

    const dataResult = yield* Effect.either(
      withRetry(run, {
        operationName,
        clientRequestId,
      })
    );

    if (Either.isLeft(dataResult)) {
      const error = dataResult.left;

      // Abort errors are expected during navigation/unmount — don't log them as errors
      if (!error.isAbort) {
        const retryLogContext = toGraphqlRetryLogContext(error, clientRequestId);

        console.error('GraphQL request failed', {
          message: error.message,
          category: retryLogContext.category,
          status: retryLogContext.status,
          source: retryLogContext.source,
          requestId: retryLogContext.requestId,
          clientRequestId: retryLogContext.clientRequestId,
          retryAfterMs: retryLogContext.retryAfterMs,
          transportCode: retryLogContext.transportCode,
          transportErrno: retryLogContext.transportErrno,
          transportSyscall: retryLogContext.transportSyscall,
          request: error.request,
          response: summarizeResponseForLog(error.response),
          correlationHint: `graphql clientRequestId=${retryLogContext.clientRequestId} requestId=${retryLogContext.requestId ?? 'unknown'} operation=${operationName ?? 'unknown'}`,
        });
      }

      return yield* Effect.fail(error);
    }

    return decoder(dataResult.right);
  });
}
