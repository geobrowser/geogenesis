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
 * A space's type (`PERSONAL`, `DAO`), or `null` for a space the API doesn't know. Cached per space,
 * and batched: a feed asks this of every card in one commit, and those asks go out together rather
 * than one request per space. A full space `useSpace` already loaded answers it without a request.
 * A space's type never changes, so the answer is kept for the session.
 */
export function useSpaceType(spaceId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const id = normId(spaceId);
  return useQuery({
    queryKey: ['space-type', id],
    queryFn: () => loadSpaceType(id),
    initialData: () => queryClient.getQueryData<Space | null>(['space', spaceId])?.type,
    // Never refetched and never dropped: `staleTime` alone still lets an unmounted card's entry be
    // garbage-collected, and the next card from that space would ask again.
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: enabled && id.length > 0,
  });
}
