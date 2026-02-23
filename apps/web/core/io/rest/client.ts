import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';
import * as Schedule from 'effect/Schedule';

import { AbortError, HttpError, JsonParseError } from '../subgraph/errors';

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 200;

interface RestConfig {
  endpoint: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortController['signal'];
}

export class ApiError extends Error {
  readonly _tag = 'ApiError';
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export type RestError = AbortError | HttpError | JsonParseError | ApiError;

function isRetryableRestError(error: RestError): boolean {
  if (error instanceof AbortError || error instanceof JsonParseError) {
    return false;
  }

  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  return error instanceof HttpError;
}

function getHeaderValue(headers: Headers, name: string): string | null {
  return headers.get(name) ?? headers.get(name.toLowerCase());
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

function withRetry<T>(operation: Effect.Effect<T, RestError>, path: string): Effect.Effect<T, RestError> {
  const retrySchedule = Schedule.exponential(Duration.millis(BASE_RETRY_DELAY_MS)).pipe(
    Schedule.jittered,
    Schedule.intersect(Schedule.identity<RestError>()),
    Schedule.modifyDelay(([_, error], duration) => {
      if (error instanceof ApiError && error.retryAfterMs !== undefined) {
        return Duration.millis(error.retryAfterMs);
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
          console.warn(`[REST] Exhausted retries for ${path}`);
        }
      })
    )
  );
}

export function restFetch<T>({ endpoint, path, method = 'GET', body, signal }: RestConfig) {
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
          },
          body: body ? JSON.stringify(body) : undefined,
          signal,
        }),
      catch: e => {
        if (e instanceof Error && e.name === 'AbortError') {
          return new AbortError();
        }

        console.error('Unknown error fetching REST endpoint', url, String(e));
        return new HttpError(String(e));
      },
    });

    if (!response.ok) {
      const retryAfterMs = parseRetryAfterMs(getHeaderValue(response.headers, 'retry-after'));

      // Try to get error message from response
      const errorMessageResult = yield* Effect.either(
        Effect.tryPromise({
          try: async () => {
            const errorBody = (await response.json()) as { error?: string; message?: string };
            return errorBody.message ?? errorBody.error ?? response.statusText;
          },
          catch: () => new JsonParseError(),
        })
      );

      const errorMessage = Either.isRight(errorMessageResult) ? errorMessageResult.right : response.statusText;

      return yield* Effect.fail(new ApiError(errorMessage, response.status, retryAfterMs));
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: () => new JsonParseError(),
    });

    return json;
  });

  return withRetry(request, path);
}
