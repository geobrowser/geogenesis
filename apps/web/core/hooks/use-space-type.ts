'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { createBatchLoader } from '~/core/io/batch-loader';
import type { Space } from '~/core/io/dto/spaces';
import { fetchSpaceTypes } from '~/core/io/subgraph/fetch-personal-space-ids';
import { normId } from '~/core/utils/norm-id';

const loadSpaceType = createBatchLoader<string | null>({
  fetchBatch: ids => fetchSpaceTypes(ids),
  missing: () => null,
  maxBatchSize: 100,
});

/**
 * A space's type (`PERSONAL`, `DAO`), or `null` if unknown. Batched across a commit, seeded from a
 * cached full space, and kept for the session since a space's type never changes.
 */
export function useSpaceType(spaceId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const id = normId(spaceId);
  return useQuery({
    queryKey: ['space-type', id],
    queryFn: () => loadSpaceType(id),
    initialData: () => queryClient.getQueryData<Space | null>(['space', spaceId])?.type,
    // A found type is never refetched or dropped (`gcTime` too, or the next card would ask again).
    // A miss goes stale at once, so a space still reaching the indexer resolves on the next mount.
    staleTime: ({ state }) => (state.data === null ? 0 : Infinity),
    gcTime: Infinity,
    enabled: enabled && id.length > 0,
  });
}
