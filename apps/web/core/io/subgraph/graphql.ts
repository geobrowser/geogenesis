import * as Effect from 'effect/Effect';

import { AbortError, GraphqlRuntimeError, HttpError, JsonParseError } from './errors';

interface GraphqlConfig {
  endpoint: string;
  query: string;
  tag?: string;
  signal?: AbortController['signal'];
}

interface GraphqlResponse<T> {
  data: T;
  errors: unknown[];
}

export function graphql<T>({ endpoint, query, signal, tag }: GraphqlConfig) {
  const graphqlFetchEffect = Effect.tryPromise({
    try: () =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal,
        next: {
          revalidate: 0,
          tags: tag ? [tag] : undefined,
        },
      }),
    catch: e => {
      if (e instanceof Error && e.name === 'AbortError') {
        return new AbortError();
      }

      return new HttpError();
    },
  });

  return Effect.retry(
    Effect.gen(function* (awaited) {
      const response = yield* awaited(Effect.retry(graphqlFetchEffect, { times: 3 }));
      const json = yield* awaited(
        Effect.tryPromise({
          try: () => response.json() as Promise<GraphqlResponse<T>>,
          catch: () => new JsonParseError(),
        })
      );

      if (json.errors?.length > 0) {
        return yield* awaited(
          Effect.fail(new GraphqlRuntimeError(json.errors.map(error => JSON.stringify(error)).join(', ')))
        );
      }

      return json.data;
    }),
    {
      times: 3,
    }
  );
}
