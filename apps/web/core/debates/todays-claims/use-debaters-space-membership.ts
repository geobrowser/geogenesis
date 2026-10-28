'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { type SpaceRoles, getSpaceRoles, normalizeSpaceId } from '~/core/access/space-access';
import { validateSpaceId } from '~/core/io/rest/validation';

/**
 * GEO-3489. For each space, how many of the debaters are members of it (an editor counts), for the
 * order Today's claims lists spaces in.
 *
 * One roles lookup per space, under the key `useSpaceRoles` uses, so a space whose roles another
 * surface already asked about for the same people is not asked again. A space whose lookup failed
 * counts nobody, which only moves it down the list.
 */
export function useDebatersSpaceMembership(spaceIds: string[], debaterSpaceIds: string[], enabled = true) {
  const debaters = React.useMemo(
    () => [...new Set(debaterSpaceIds.map(validateSpaceId).filter((id): id is string => id !== null))].sort(),
    [debaterSpaceIds]
  );
  const spaces = React.useMemo(() => [...new Set(spaceIds.map(normalizeSpaceId))].sort(), [spaceIds]);

  const combine = React.useCallback(
    (results: { data?: SpaceRoles; isLoading: boolean }[]) => {
      const membersBySpace = new Map<string, number>();
      results.forEach((result, index) => {
        const roles = result.data;
        if (!roles) return;
        const members = debaters.filter(
          id => roles.memberSpaceIds.has(normalizeSpaceId(id)) || roles.editorSpaceIds.has(normalizeSpaceId(id))
        ).length;
        membersBySpace.set(spaces[index]!, members);
      });
      return {
        debatersIn: (spaceId: string) => membersBySpace.get(normalizeSpaceId(spaceId)) ?? 0,
        isLoading: results.some(result => result.isLoading),
      };
    },
    [debaters, spaces]
  );

  return useQueries({
    queries: spaces.map(spaceId => ({
      queryKey: ['space-roles', spaceId, debaters],
      queryFn: ({ signal }: { signal?: AbortSignal }) => Effect.runPromise(getSpaceRoles(spaceId, debaters, signal)),
      enabled: enabled && debaters.length > 0,
      // Read once: the order it feeds is set when the picker opens.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    })),
    combine,
  });
}
