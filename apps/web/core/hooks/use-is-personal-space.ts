'use client';

import { useQuery } from '@tanstack/react-query';

import { createBatchLoader } from '~/core/io/batch-loader';
import { fetchPersonalSpaceIds } from '~/core/io/subgraph/fetch-personal-space-ids';
import { normId } from '~/core/utils/norm-id';

const loadIsPersonalSpace = createBatchLoader<boolean>({
  fetchBatch: async ids => {
    const people = await fetchPersonalSpaceIds(ids);
    return new Map(ids.map(id => [id, people.has(id)]));
  },
  missing: () => false,
  maxBatchSize: 100,
});

/**
 * Whether a space is someone's personal space. Cached per space, and batched: a feed asks this of
 * every card in one commit, and those asks go out together rather than one request per space.
 * `undefined` until known. A space's type never changes, so the answer is kept for good.
 */
export function useIsPersonalSpace(spaceId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const id = normId(spaceId);
  const { data } = useQuery({
    queryKey: ['is-personal-space', id],
    queryFn: () => loadIsPersonalSpace(id),
    staleTime: Infinity,
    enabled: enabled && id.length > 0,
  });
  return data;
}
