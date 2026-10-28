'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { type SpaceRoles, normalizeSpaceId } from '~/core/access/space-access';
import { spaceRolesQueryOptions } from '~/core/hooks/use-space-editor-ids';

/**
 * GEO-3489. For each space, how many of the debaters are members of it (an editor counts), for the
 * order Today's claims lists spaces in.
 *
 * One roles lookup per space, through `spaceRolesQueryOptions`, so a space whose roles another
 * surface already asked about for the same people is not asked again. A space whose lookup failed
 * counts nobody, which only moves it down the list.
 */
export function useDebatersSpaceMembership(spaceIds: string[], debaterSpaceIds: string[], enabled = true) {
  const spaces = React.useMemo(() => [...new Set(spaceIds.map(normalizeSpaceId))].sort(), [spaceIds]);

  const combine = React.useCallback(
    (results: { data?: SpaceRoles; isLoading: boolean }[]) => {
      const membersBySpace = new Map<string, number>();
      results.forEach((result, index) => {
        const roles = result.data;
        if (!roles) return;
        const members = debaterSpaceIds.filter(id => {
          const spaceId = normalizeSpaceId(id);
          return roles.memberSpaceIds.has(spaceId) || roles.editorSpaceIds.has(spaceId);
        }).length;
        membersBySpace.set(spaces[index]!, members);
      });
      return {
        debatersIn: (spaceId: string) => membersBySpace.get(normalizeSpaceId(spaceId)) ?? 0,
        isLoading: results.some(result => result.isLoading),
      };
    },
    [debaterSpaceIds, spaces]
  );

  return useQueries({
    queries: spaces.map(spaceId => {
      const options = spaceRolesQueryOptions(spaceId, debaterSpaceIds);
      return {
        ...options,
        enabled: enabled && options.enabled,
        // Read once: the order it feeds is set when the picker opens.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      };
    }),
    combine,
  });
}
