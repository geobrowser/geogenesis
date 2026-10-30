import { queryOptions } from '@tanstack/react-query';

import { loadBrowseSidebarData } from '~/partials/browse-sidebar/load-browse-sidebar-data';

import { browseSidebarDataQueryKey } from './browse-sidebar-query';
import { fetchBrowseSidebarData } from './fetch-browse-sidebar-data';

/**
 * Use this in every `useQuery` on the browse sidebar data. A refetch runs with the options of the
 * last one rendered, so each needs this `queryFn`.
 */
export function browseSidebarQueryOptions({
  personalSpaceId,
  walletAddress,
}: {
  personalSpaceId: string | null;
  walletAddress?: string;
}) {
  return queryOptions({
    queryKey: browseSidebarDataQueryKey(personalSpaceId ?? walletAddress ?? null),
    queryFn: () => (personalSpaceId ? fetchBrowseSidebarData(personalSpaceId) : loadBrowseSidebarData(walletAddress)),
    staleTime: 60_000,
  });
}
