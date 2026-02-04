import * as Effect from 'effect/Effect';

import { AbortError, HttpError, JsonParseError } from '../subgraph/errors';

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

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type RestError = AbortError | HttpError | JsonParseError | ApiError;

export function restFetch<T>({ endpoint, path, method = 'GET', body, signal }: RestConfig) {
  return Effect.gen(function* () {
    const url = `${endpoint}${path}`;

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
      // Try to get error message from response
      const errorMessage = yield* Effect.tryPromise({
        try: async () => {
          const errorBody = (await response.json()) as { error?: string; message?: string };
          return errorBody.message ?? errorBody.error ?? response.statusText;
        },
        catch: () => response.statusText,
      });

      return yield* Effect.fail(new ApiError(errorMessage, response.status));
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: () => new JsonParseError(),
    });

    return json;
  });
}
