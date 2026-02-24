import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import * as Schedule from 'effect/Schedule';

import {
  classifyTransportFailure,
  isIngressUnavailableHtml,
  isRetryableCategory,
  parseRetryAfterMs,
  type RetryCategory,
  withRetryAfterJitter,
} from '../errors/retry-utils';
import { AbortError, JsonParseError } from '../subgraph/errors';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 200;

interface RestConfig {
  endpoint: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortController['signal'];
}

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class ApiError extends Error {
  readonly _tag = 'ApiError';
  readonly status: number;
  readonly retryAfterMs?: number;
  readonly retryCategory?: RetryCategory;
  readonly source?: 'api' | 'ingress' | 'unknown';
  readonly requestId?: string;
  readonly clientRequestId?: string;

  constructor(
    message: string,
    status: number,
    details?: {
      retryAfterMs?: number;
      retryCategory?: RetryCategory;
      source?: 'api' | 'ingress' | 'unknown';
      requestId?: string;
      clientRequestId?: string;
    }
  ) {
    super(message);
    this.status = status;
    this.retryAfterMs = details?.retryAfterMs;
    this.retryCategory = details?.retryCategory;
    this.source = details?.source;
    this.requestId = details?.requestId;
    this.clientRequestId = details?.clientRequestId;
  }
}

export class TransportError extends Error {
  readonly _tag = 'TransportError';
  readonly retryCategory: RetryCategory;
  readonly code?: string;
  readonly errno?: string;
  readonly syscall?: string;
  readonly causeName?: string;
  readonly causeMessage?: string;
  readonly causeCode?: string;
  readonly clientRequestId?: string;

  constructor(
    message: string,
    details: {
      retryCategory: RetryCategory;
      code?: string;
      errno?: string;
      syscall?: string;
      causeName?: string;
      causeMessage?: string;
      causeCode?: string;
      clientRequestId?: string;
    }
  ) {
    super(message);
    this.retryCategory = details.retryCategory;
    this.code = details.code;
    this.errno = details.errno;
    this.syscall = details.syscall;
    this.causeName = details.causeName;
    this.causeMessage = details.causeMessage;
    this.causeCode = details.causeCode;
    this.clientRequestId = details.clientRequestId;
  }
}

export type RestError = AbortError | JsonParseError | ApiError | TransportError;

type RetryLogContext = {
  category: RetryCategory;
  clientRequestId: string;
  requestId?: string;
  retryAfterMs?: number;
  transportCode?: string;
  transportErrno?: string;
  transportSyscall?: string;
  source?: 'api' | 'ingress' | 'unknown';
  status?: number;
};

function isRetryableRestError(error: RestError): boolean {
  switch (error._tag) {
    case 'AbortError':
    case 'JsonParseError':
      return false;
    case 'TransportError':
      return isRetryableCategory(error.retryCategory);
    case 'ApiError':
      return error.status === 408 || error.status === 429 || error.status >= 500;
    default:
      return false;
  }
}

function toRetryLogContext(error: RestError, fallbackClientRequestId: string): RetryLogContext {
  switch (error._tag) {
    case 'ApiError':
      return {
        category: error.retryCategory ?? (error.status >= 500 ? 'http_5xx_other' : 'http_4xx_non_retryable'),
        clientRequestId: error.clientRequestId ?? fallbackClientRequestId,
        requestId: error.requestId,
        retryAfterMs: error.retryAfterMs,
        source: error.source,
        status: error.status,
      };
    case 'TransportError':
      return {
        category: error.retryCategory,
        clientRequestId: error.clientRequestId ?? fallbackClientRequestId,
        transportCode: error.code,
        transportErrno: error.errno,
        transportSyscall: error.syscall,
      };
    default:
      return {
        category: 'transport_unknown',
        clientRequestId: fallbackClientRequestId,
      };
  }
}

function getHeaderValue(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase());
}

function classifyApiErrorStatus(
  status: number,
  source: 'api' | 'ingress' | 'unknown',
  payload: { error?: string; message?: string } | null
): RetryCategory {
  if (status === 503 && payload?.error === 'database temporarily overloaded') {
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

function detectResponseSource(
  contentType: string | null,
  responseText: string,
  payload: { error?: string; message?: string } | null
): 'api' | 'ingress' | 'unknown' {
  if (payload?.error === 'database temporarily overloaded') {
    return 'api';
  }

  const normalizedContentType = (contentType ?? '').toLowerCase();
  if (isIngressUnavailableHtml(normalizedContentType, responseText)) {
    return 'ingress';
  }

  if (normalizedContentType.includes('application/json') && (payload?.error || payload?.message)) {
    return 'api';
  }

  return 'unknown';
}

function withRetry<T>(
  operation: Effect.Effect<T, RestError>,
  context: { path: string; method: 'GET' | 'POST'; clientRequestId: string }
): Effect.Effect<T, RestError> {
  const retrySchedule = Schedule.exponential(Duration.millis(BASE_RETRY_DELAY_MS)).pipe(
    Schedule.jittered,
    Schedule.intersect(Schedule.identity<RestError>()),
    Schedule.modifyDelay(([_, error], duration) => {
      if (error._tag === 'ApiError' && error.retryAfterMs !== undefined) {
        return Duration.millis(withRetryAfterJitter(error.retryAfterMs));
      }

      return duration;
    }),
    Schedule.whileInput(isRetryableRestError),
    Schedule.intersect(Schedule.recurs(MAX_RETRIES))
  );

  return Effect.retry(operation, retrySchedule).pipe(
    Effect.tapError(error =>
      Effect.sync(() => {
        if (isRetryableRestError(error)) {
          const retryLogContext = toRetryLogContext(error, context.clientRequestId);

          console.warn(`[REST] Exhausted retries for ${context.path}`, {
            path: context.path,
            method: context.method,
            clientRequestId: retryLogContext.clientRequestId,
            category: retryLogContext.category,
            status: retryLogContext.status,
            source: retryLogContext.source,
            requestId: retryLogContext.requestId,
            retryAfterMs: retryLogContext.retryAfterMs,
            transportCode: retryLogContext.transportCode,
            transportErrno: retryLogContext.transportErrno,
            transportSyscall: retryLogContext.transportSyscall,
            maxRetries: MAX_RETRIES,
            correlationHint: `rest clientRequestId=${retryLogContext.clientRequestId} requestId=${retryLogContext.requestId ?? 'unknown'} path=${context.path}`,
          });
        }
      })
    )
  );
}

export function restFetch<T>({ endpoint, path, method = 'GET', body, signal }: RestConfig) {
  const clientRequestId = createClientRequestId();

  const request = Effect.gen(function* () {
    // Strip /graphql suffix if present - REST endpoints use the base URL
    const baseUrl = endpoint.replace(/\/graphql$/, '');
    const url = `${baseUrl}${path}`;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': clientRequestId,
            'x-correlation-id': clientRequestId,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal,
        }),
      catch: e => {
        if (e instanceof Error && e.name === 'AbortError') {
          return new AbortError();
        }

        const transport = classifyTransportFailure(e);
        console.error('Unknown error fetching REST endpoint', {
          url,
          method,
          path,
          clientRequestId,
          category: transport.category,
          name: transport.name,
          message: transport.message,
          code: transport.code,
          errno: transport.errno,
          syscall: transport.syscall,
          causeName: transport.causeName,
          causeMessage: transport.causeMessage,
          causeCode: transport.causeCode,
        });
        return new TransportError(transport.message, {
          retryCategory: transport.category,
          code: transport.code,
          errno: transport.errno,
          syscall: transport.syscall,
          causeName: transport.causeName,
          causeMessage: transport.causeMessage,
          causeCode: transport.causeCode,
          clientRequestId,
        });
      },
    });

    if (!response.ok) {
      const retryAfterMs = parseRetryAfterMs(getHeaderValue(response.headers, 'retry-after'));
      const contentType = getHeaderValue(response.headers, 'content-type');
      const requestId = getHeaderValue(response.headers, 'x-request-id') ?? undefined;
      const responseTextResult = yield* Effect.either(
        Effect.tryPromise({
          try: () => response.text(),
          catch: () => new JsonParseError(),
        })
      );
      const responseText = Either.isRight(responseTextResult) ? responseTextResult.right : '';

      const payload = Either.getOrNull(
        yield* Effect.either(
          Effect.try({
            try: () => JSON.parse(responseText) as { error?: string; message?: string },
            catch: () => new JsonParseError(),
          })
        )
      );

      const source = detectResponseSource(contentType, responseText, payload);
      const retryCategory = classifyApiErrorStatus(response.status, source, payload);
      const errorMessage = payload?.message ?? payload?.error ?? response.statusText;

      return yield* Effect.fail(
        new ApiError(errorMessage, response.status, {
          retryAfterMs,
          retryCategory,
          source,
          requestId,
          clientRequestId,
        })
      );
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: () => new JsonParseError(),
    });

    return json;
  });

  return withRetry(request, {
    path,
    method,
    clientRequestId,
  });
}
