'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { personalSpacesByPageIdsQueryKey } from '~/core/io/query-keys';
import { fetchPersonalSpacesByPageIds } from '~/core/io/subgraph/fetch-personal-spaces-by-page-ids';
import { normId } from '~/core/utils/norm-id';

/**
 * The personal space each page (person) entity fronts, keyed by normalized
 * page id. Ids that front no personal space are absent from the map.
 */
export function usePersonalSpacesByPageIds(pageIds: readonly string[], enabled = true) {
  const ids = React.useMemo(() => [...new Set(pageIds.map(normId))].sort(), [pageIds]);
  return useQuery({
    queryKey: personalSpacesByPageIdsQueryKey(ids),
    queryFn: () => fetchPersonalSpacesByPageIds(ids),
    enabled: enabled && ids.length > 0,
    // Which space a person fronts does not change under them.
    staleTime: 10 * 60_000,
  });
}
