'use client';

import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBatchLoader } from '~/core/io/batch-loader';
import type { Space } from '~/core/io/dto/spaces';
import { spaceByIdQueryKey } from '~/core/io/query-keys';
import { fetchSpaceTypes } from '~/core/io/subgraph/fetch-personal-space-ids';
import { normId } from '~/core/utils/norm-id';

const loadSpaceType = createBatchLoader<string | null>({
  fetchBatch: ids => fetchSpaceTypes(ids),
  missing: () => null,
  maxBatchSize: 100,
});

/**
 * A type already in hand: from a full space (`useSpace`) or a per-id space (`useSpacesByIds`).
 * `['space', id]` is keyed on each caller's spelling, so it is matched on the normalized id.
 */
function cachedSpaceType(queryClient: QueryClient, id: string): string | undefined {
  const fromSpaces = queryClient.getQueryData<Space | null>(spaceByIdQueryKey(id))?.type;
  if (fromSpaces) return fromSpaces;
  for (const [key, space] of queryClient.getQueriesData<Space | null>({ queryKey: ['space'] })) {
    if (key.length === 2 && typeof key[1] === 'string' && normId(key[1]) === id && space?.type) return space.type;
  }
  return undefined;
}

/**
 * A space's type (`PERSONAL`, `DAO`), or `null` if unknown. Batched across a commit, seeded from a
 * cached space, and kept for the session since a space's type never changes.
 */
export function useSpaceType(spaceId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const id = normId(spaceId);
  return useQuery({
    queryKey: ['space-type', id],
    queryFn: () => loadSpaceType(id),
    initialData: () => cachedSpaceType(queryClient, id),
    // A found type is never refetched or dropped (`gcTime` too, or the next card would ask again).
    // A miss goes stale at once, so a space still reaching the indexer resolves on the next mount.
    staleTime: ({ state }) => (state.data === null ? 0 : Infinity),
    gcTime: Infinity,
    enabled: enabled && id.length > 0,
  });
}
