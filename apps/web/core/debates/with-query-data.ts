/**
 * A query result carrying derived `data`, without restating the rest of it.
 *
 * Mirrors `holdWhileSpaceResolves` in `core/debates/hooks`: generic in the result so the whole
 * react-query surface — `isLoading`, `fetchNextPage`, the lot — passes through with its own types
 * rather than being widened by a cast.
 *
 * The replacement is typed `T['data']` rather than inferred from its own parameter. Inferring it
 * gave the compiler two sites to work from, so a value *wider* than the query's data — a `null` the
 * query never admits — widened the inference to fit instead of failing, and came back typed as the
 * narrower `T`. Indexing off `T` leaves one source of truth for the shape.
 *
 * Forwarded through a proxy rather than spread. React Query hands back a result whose properties
 * are tracked on access, and only the ones a component actually reads wake it for a re-render.
 * Spreading reads all of them, which would have subscribed every consumer of these three hooks to
 * every status change — `isFetching` flipping on a window-focus refetch would re-render the whole
 * People, Claims or Requests surface for rows that did not move. `participant-positions` carries a
 * note about the same trap costing a page a re-render every 20s, from reading a single timestamp.
 * A proxy keeps the reads lazy, so a consumer still tracks exactly what it touches.
 */
export function withQueryData<T extends { data: unknown }>(query: T, data: T['data']): T {
  return new Proxy(query, {
    // `Reflect.get` without a receiver: React Query's tracking lives in getters on the result, and
    // they have to run against it rather than against this proxy to record the access.
    get: (target, property) => (property === 'data' ? data : Reflect.get(target, property)),
  });
}
