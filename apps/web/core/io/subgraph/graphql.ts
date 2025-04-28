import * as Effect from 'effect/Effect';

import { AbortError, GraphqlRuntimeError, HttpError, JsonParseError, RailwayError } from './errors';

interface GraphqlConfig {
  endpoint: string;
  query: string;
  signal?: AbortController['signal'];
}

interface GraphqlResponse<T> {
  data: T;
  errors: { message?: string }[];
}

export function graphql<T>({ endpoint, query, signal }: GraphqlConfig) {
  return Effect.retry(
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
            signal,
          }),
        catch: e => {
          if (e instanceof Error && e.name === 'AbortError') {
            return new AbortError();
          }

          console.error('Unknown error fetching GraphQL endpoint', endpoint, String(e));
          return new HttpError(String(e));
        },
      });

      const json = yield* Effect.tryPromise({
        try: () => response.json() as Promise<GraphqlResponse<T>>,
        catch: () => new JsonParseError(),
      });

      if (json.errors && json.errors.length > 0) {
        const message = json.errors[0].message;

        // For some reason this error happens only in production and only rarely.
        // I can't find any info as to how this happens, other than potentially
        // some kind of DNS resolution issue. Maybe the IP address changes or something?
        if (message === 'getaddrinfo EAI_AGAIN metro.proxy.rlwy.net') {
          return yield* Effect.fail(new RailwayError(message));
        }

        return yield* Effect.fail(new GraphqlRuntimeError(json.errors.map(error => JSON.stringify(error)).join(', ')));
      }

      return json.data;
    }),
    // only retry if we get RailwayErrors
    {
      times: 3,
      while: error => error._tag === 'RailwayError',
    }
  );
}
