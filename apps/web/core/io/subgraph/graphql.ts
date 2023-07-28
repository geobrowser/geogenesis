import { Effect } from 'effect';

interface GraphqlConfig {
  endpoint: string;
  query: string;
  abortController?: AbortController;
}

class HttpError {
  readonly _tag = 'HttpError';
}

class JsonParseError {
  readonly _tag = 'JsonParseError';
}

class GraphqlRuntimeError extends Error {
  readonly _tag = 'GraphqlRuntimeError';
}

interface GraphqlResponse<T> {
  data: T;
  errors: unknown[];
}

export function graphql<T>({ endpoint, query, abortController }: GraphqlConfig) {
  const graphqlFetchEffect = Effect.tryPromise({
    try: () =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal: abortController?.signal,
      }),
    // @TODO: Specific HttpErrors
    catch: () => new HttpError(),
  });

  return Effect.gen(function* (awaited) {
    const response = yield* awaited(graphqlFetchEffect);
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
  });
}
