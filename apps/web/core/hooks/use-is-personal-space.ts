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
 * `undefined` until known. A space's type never changes, so the answer is kept for the session.
 */
export function useIsPersonalSpace(spaceId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const id = normId(spaceId);
  const { data } = useQuery({
    queryKey: ['is-personal-space', id],
    queryFn: () => loadIsPersonalSpace(id),
    // Never refetched and never dropped: `staleTime` alone still lets an unmounted card's entry be
    // garbage-collected, and the next card from that space would ask again.
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: enabled && id.length > 0,
  });
  return data;
}
