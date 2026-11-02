import { Effect } from 'effect';

import { createBatchLoader } from '~/core/io/batch-loader';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';
import { spaceByIdQueryKey } from '~/core/io/query-keys';
import { normId } from '~/core/utils/norm-id';

/** Ids per `spaces` request: an `in` filter this long stays a sane request. */
const MAX_BATCH_SIZE = 100;

/** A space's name and image are about as static as this app's data gets. */
export const SPACE_STALE_TIME = 5 * 60_000;

/**
 * Fetch one space by id, coalescing every call made in the same tick into one `spaces` request
 * per 100 ids. `null` for a space the API doesn't return.
 */
export const loadSpaceById = createBatchLoader<Space | null>({
  fetchBatch: async spaceIds => {
    const spaces = await Effect.runPromise(getSpaces({ spaceIds, limit: spaceIds.length }));
    return spacesByRequestedId(spaceIds, spaces);
  },
  missing: () => null,
  maxBatchSize: MAX_BATCH_SIZE,
});

/** Matches answers to the ids asked for, whichever spelling (dashed or not) each one used. */
export function spacesByRequestedId(spaceIds: readonly string[], spaces: readonly Space[]) {
  const byNormalized = new Map(spaces.map(space => [normId(space.id), space]));
  return new Map(
    spaceIds.flatMap(id => {
      const space = byNormalized.get(normId(id));
      return space ? [[id, space] as const] : [];
    })
  );
}

/**
 * Per-id cache entry. A miss goes stale at once, so a space created or joined a moment ago
 * resolves on the next mount rather than staying missing for the session.
 */
export function spaceByIdQueryOptions(spaceId: string) {
  return {
    queryKey: spaceByIdQueryKey(spaceId),
    queryFn: () => loadSpaceById(spaceId),
    staleTime: ({ state }: { state: { data: Space | null | undefined } }) =>
      state.data === null ? 0 : SPACE_STALE_TIME,
  };
}
