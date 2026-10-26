'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpacesByPageIds } from '~/core/hooks/use-personal-spaces-by-page-ids';
import { personalSpaceIdsQueryKey } from '~/core/io/query-keys';
import { fetchPersonalSpaceIds } from '~/core/io/subgraph/fetch-personal-space-ids';
import { normId } from '~/core/utils/norm-id';

/**
 * The personal space behind each curator id on a bounty. Allocation and interest
 * targets are either a personal space (Geo's shape) or the person entity that
 * fronts one (curator-app's), and payouts must go to the space. An id is only
 * resolved when it is positively one or the other: a person with no personal
 * space resolves to `null`, never to itself, so nothing can be paid to a person
 * entity by default.
 */
export function useCuratorSpaces(ids: readonly string[], enabled = true) {
  const unique = React.useMemo(() => [...new Set(ids.map(normId))].sort(), [ids]);
  const spaceByPerson = usePersonalSpacesByPageIds(unique, enabled);
  const personalSpaces = useQuery({
    queryKey: personalSpaceIdsQueryKey(unique),
    queryFn: () => fetchPersonalSpaceIds(unique),
    enabled: enabled && unique.length > 0,
    // A space's type does not change.
    staleTime: 10 * 60_000,
  });

  const spaceOf = React.useCallback(
    (id: string): string | null => {
      const key = normId(id);
      return spaceByPerson.data?.get(key) ?? (personalSpaces.data?.has(key) ? key : null);
    },
    [personalSpaces.data, spaceByPerson.data]
  );

  return { spaceOf, isResolved: spaceByPerson.isSuccess && personalSpaces.isSuccess };
}
