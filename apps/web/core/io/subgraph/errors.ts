export class HttpError {
  readonly _tag = 'HttpError';
}

export class JsonParseError {
  readonly _tag = 'JsonParseError';
}

export class GraphqlRuntimeError extends Error {
  readonly _tag = 'GraphqlRuntimeError';
}

export class AbortError {
  readonly _tag = 'AbortError';
}
