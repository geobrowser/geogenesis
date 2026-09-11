/**
 * Resolve to `fallback` if `work` has not settled within `ms`.
 *
 * For decoration fetched on the server — a side rail, a header-width seed — where the page is
 * expected to render without it. `.catch(() => [])` on those calls looks like it covers failure,
 * but it only covers *rejection*: `core/io/subgraph/graphql` passes no signal and sets no timeout,
 * so a request against a wedged upstream never settles, and an `await` on it never returns. The
 * surface waiting on it then renders nothing at all — not the degraded version the catch implies,
 * and not an error anyone gets paged about either.
 *
 * The loser's rejection is swallowed deliberately: once the timeout has won, a late failure from a
 * request nobody is waiting on is not an unhandled rejection worth crashing a server on.
 *
 * This does not cancel the request — `graphql` accepts a signal, but threading one through every
 * fetch is a wider change than bounding the render. The socket is left to finish on its own.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  work.catch(() => {});

  const expiry = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
  });

  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

/**
 * How long the space rail's server fetches get.
 *
 * Generous against what these queries actually cost — the subtopics and community-call lookups
 * answer in well under a second warm — because this is a ceiling on pathology, not a latency
 * budget. Anything near it already means the reader is waiting on a rail they did not ask for.
 */
export const SIDE_RAIL_FETCH_TIMEOUT_MS = 5_000;
