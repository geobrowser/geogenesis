import * as Effect from 'effect/Effect';

import { AbortError, GraphqlRuntimeError, HttpError, JsonParseError } from './errors';

interface GraphqlConfig {
  endpoint: string;
  query: string;
  signal?: AbortController['signal'];
}

interface GraphqlResponse<T> {
  data: T;
  errors: unknown[];
}

export function graphql<T>({ endpoint, query, signal }: GraphqlConfig) {
  return Effect.gen(function* () {
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

    if (json.errors?.length > 0) {
      return yield* Effect.fail(new GraphqlRuntimeError(json.errors.map(error => JSON.stringify(error)).join(', ')));
    }

    return json.data;
  });
}
