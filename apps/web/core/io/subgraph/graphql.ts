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
  readonly _tag = 'JSONParseError';
}

export function graphql<T>({
  endpoint,
  query,
  abortController,
}: GraphqlConfig): Effect.Effect<never, HttpError | JsonParseError, T> {
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
        try: () => response.json() as Promise<T>,
        catch: () => new JsonParseError(),
      })
    );

    return json;
  });
}
