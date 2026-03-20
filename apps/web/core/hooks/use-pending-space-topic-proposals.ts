'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchPendingSpaceTopicProposals } from '~/core/io/subgraph/fetch-pending-space-topic-proposals';

export function usePendingSpaceTopicProposals(spaceId: string, enabled = true) {
  return useQuery({
    queryKey: ['pending-space-topic-proposals', spaceId],
    queryFn: () => fetchPendingSpaceTopicProposals(spaceId),
    enabled: enabled && Boolean(spaceId),
  });
}
