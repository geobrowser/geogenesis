export class HttpError extends Error {
  readonly _tag = 'HttpError';
}

export class RailwayError extends Error {
  readonly _tag = 'RailwayError';
}

export class JsonParseError extends Error {
  readonly _tag = 'JsonParseError';
}

export class GraphqlRuntimeError extends Error {
  readonly _tag = 'GraphqlRuntimeError';
}

export class AbortError {
  readonly _tag = 'AbortError';
}
