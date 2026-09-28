/**
 * Run `work` with a deadline, resolving to `fallback` if it has not settled within `ms`.
 *
 * Named for what it does on expiry, because `core/debates/server-clock` has a private
 * `withTimeout` that *rejects* instead — it feeds a retry loop that needs the rejection. Two
 * helpers with one name and opposite failure modes is a trap; the name says which this is.
 *
 * For decoration fetched on the server — a side rail, a header-width seed — where the page is
 * expected to render without it. `.catch(() => [])` on those calls looks like it covers failure,
 * but it only covers *rejection*: `core/io/subgraph/graphql` sets no timeout of its own, so a
 * request against a wedged upstream never settles, and an `await` on it never returns. The surface
 * waiting on it then renders nothing at all — not the degraded version the catch implies, and not
 * an error anyone gets paged about either.
 *
 * Two things happen at the deadline, and both are needed:
 *
 *   * **The signal is aborted**, so a fetcher that accepts one stops work and frees its socket.
 *     Without this the request is abandoned rather than cancelled, and during an outage every page
 *     view leaves another one alive with its retries — a stalled render becoming accumulating
 *     in-flight work.
 *   * **The race resolves anyway.** Not every fetcher here can take a signal yet: some run through
 *     query layers that do not thread one, and a fetcher that ignores its signal would otherwise
 *     hang exactly as before. Cancellation is the improvement; the race is what makes the bound a
 *     guarantee rather than a hope.
 *
 * `run` receives the signal rather than the helper cancelling on the caller's behalf, because
 * whether cancelling is *safe* is the caller's question to answer. A memoised fetch — anything
 * behind `React.cache` or a shared in-flight promise — must not be handed a per-request signal:
 * one caller's deadline would abort the promise every other caller is awaiting, turning a slow
 * rail into a broken page elsewhere. `fetchFeaturedSpacesShared` documents the same hazard from
 * the other direction. So a caller passes the signal only when it owns the request, and ignores
 * the argument otherwise; the bound still holds either way, because the race does not depend on
 * cancellation.
 *
 * An abort raised by this deadline resolves to `fallback` rather than propagating: it is this
 * helper's own doing, not a fault of the upstream, and reporting it would fill the error tracker
 * during precisely the outage it exists to survive. A rejection from any other cause still
 * propagates, so a caller that wants to report a real failure can. The loser's rejection is
 * swallowed so a late failure nobody is waiting on cannot take a server down.
 */
export function resolveWithin<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, fallback: T): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const work = run(controller.signal);
  work.catch(() => {});

  const expiry = new Promise<T>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(fallback);
    }, ms);
  });

  const settled = work.catch((error: unknown) => {
    if (controller.signal.aborted) return fallback;
    throw error;
  });

  return Promise.race([settled, expiry]).finally(() => clearTimeout(timer));
}

/**
 * How long the space rail's server fetches get.
 *
 * Generous against what these queries actually cost — the subtopics and community-call lookups
 * answer in well under a second warm — because this is a ceiling on pathology, not a latency
 * budget. Anything near it already means the reader is waiting on a rail they did not ask for.
 */
export const SIDE_RAIL_FETCH_TIMEOUT_MS = 5_000;
