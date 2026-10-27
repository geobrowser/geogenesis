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

/**
 * Whether a rejection is a cancelled request rather than a failing one.
 *
 * Both shapes reach callers and neither is reliably the one you get: `graphql` and `restFetch`
 * convert an aborted fetch into the tagged `AbortError` above, while an abort raised by the
 * platform — or one crossing a module boundary where a second copy of this class is in play —
 * arrives as a DOM error carrying `name` instead. Callers were spelling out both by hand, or
 * (more often) only one of them.
 *
 * `search-cancellation` keeps its own, wider predicate on purpose: it also has to see through
 * Effect fiber failures and React Query's `CancelledError`, which is a different problem from
 * asking whether the thing in hand is an abort.
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof AbortError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const { name, _tag } = error as { name?: unknown; _tag?: unknown };
  return name === 'AbortError' || _tag === 'AbortError';
}
