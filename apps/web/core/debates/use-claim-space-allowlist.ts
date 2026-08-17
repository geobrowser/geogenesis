'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { browseSidebarDataQueryKey } from '~/core/browse/browse-sidebar-query';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import { browseSidebarClaimSpaceAllowlist } from './claim-space-allowlist';

/**
 * The spaces the viewer may see claims from — featured spaces, plus the spaces they are a member
 * or an editor of. See {@link browseSidebarClaimSpaceAllowlist} for how the set is assembled.
 *
 * Keyed and fetched exactly like the browse sidebar's own query, so on any page that renders the
 * sidebar (every page under `app/entry.tsx`) this reads the sidebar's cache rather than repeating
 * its featured-topic traversal. `useQueryFromSpacesList` shares the same key for the same reason.
 *
 * `allowlist` is null until the sources settle, which callers must read as "don't filter yet"
 * rather than "nothing is allowed".
 */
export function useClaimSpaceAllowlist(): { allowlist: Set<string> | null; isLoading: boolean } {
  const { personalSpaceId, isLoading: personalSpaceLoading } = usePersonalSpaceId();

  // Held until the personal space resolves. Fetching against a not-yet-known member space would
  // key and cache a featured-only sidebar — the signed-out answer — for a signed-in viewer, and
  // drop their own spaces out of the allowlist for as long as that entry stayed fresh.
  const enabled = !personalSpaceLoading;

  const { data, isLoading } = useQuery({
    queryKey: browseSidebarDataQueryKey(personalSpaceId),
    queryFn: () => fetchBrowseSidebarData(personalSpaceId),
    enabled,
    staleTime: 60_000,
  });

  const allowlist = React.useMemo(
    () => (data ? browseSidebarClaimSpaceAllowlist(data, personalSpaceId) : null),
    [data, personalSpaceId]
  );

  return { allowlist, isLoading: personalSpaceLoading || (enabled && isLoading) };
}
