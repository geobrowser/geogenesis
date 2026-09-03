'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { browseSidebarDataQueryKey } from '~/core/browse/browse-sidebar-query';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { useBrowseSidebarQuerySource } from '~/core/browse/use-browse-sidebar-cache';

import { loadBrowseSidebarData } from '~/partials/browse-sidebar/load-browse-sidebar-data';

import { browseSidebarClaimSpaceAllowlist, browseSidebarMemberSpaceIds } from './claim-space-allowlist';

/**
 * The spaces the viewer may see claims from — featured spaces, plus the spaces they are a member
 * or an editor of. See {@link browseSidebarClaimSpaceAllowlist} for how the set is assembled.
 *
 * Keyed and fetched exactly like `BrowseSidebar`'s own query, down to the wallet-address fallback
 * key, so on any page that renders the sidebar (every page under `app/entry.tsx`) this reads the
 * sidebar's cache rather than repeating its featured-topic traversal.
 *
 * The fallback is not just a cache-sharing nicety. `usePersonalSpaceId` resolves a space from the
 * wallet address alone, where the sidebar's resolver prefers the wallet's *profile* space and only
 * falls back to that lookup — so a viewer whose profile carries a space id the address lookup
 * misses reads as having no personal space here. Keying on the address and going through the same
 * resolver is what keeps their own member and editor spaces in the allowlist.
 *
 * `allowlist` is null until the sources settle, which callers must read as "don't filter yet"
 * rather than "nothing is allowed". `memberSpaceIds` — the narrower set the viewer actually
 * belongs to, which the space filter defaults to (GEO-2789) — is null on the same terms, and comes
 * off this query rather than its own: it is the same sidebar payload, read two ways.
 */
export function useClaimSpaceAllowlist(): {
  allowlist: Set<string> | null;
  memberSpaceIds: Set<string> | null;
  isLoading: boolean;
} {
  const { personalSpaceId, walletAddress, keyInput, isLoading: personalSpaceLoading } = useBrowseSidebarQuerySource();

  // Held until the account and the personal space both resolve (`usePersonalSpaceId` waits on the
  // smart account itself). Fetching before then would key and cache a featured-only sidebar — the
  // signed-out answer — under the no-wallet key for a signed-in viewer, and drop their own spaces
  // out of the allowlist for as long as that entry stayed fresh.
  const enabled = !personalSpaceLoading;

  const { data, isLoading } = useQuery({
    queryKey: browseSidebarDataQueryKey(keyInput),
    queryFn: () => (personalSpaceId ? fetchBrowseSidebarData(personalSpaceId) : loadBrowseSidebarData(walletAddress)),
    enabled,
    staleTime: 60_000,
  });

  // `enabled: false` only stops the fetch — a cache entry already sitting under this key is still
  // handed back, synchronously. While the account is resolving that key is whatever partial
  // identity we have so far, so a signed-out, featured-only entry left over from earlier in the
  // session would answer here and pass for a settled allowlist: the viewer's own spaces filtered
  // out of their own panel, with nothing marking it as still loading. Same gate as the fetch.
  const allowlist = React.useMemo(
    () => (personalSpaceLoading || !data ? null : browseSidebarClaimSpaceAllowlist(data, personalSpaceId)),
    [data, personalSpaceId, personalSpaceLoading]
  );

  // Same gate, for the same reason: a signed-out entry left over under a partial key would read as
  // a settled answer of "you belong to nothing", which is the case the default treats as a viewer
  // with no memberships and falls back to showing everything. Held as null until it is real.
  const memberSpaceIds = React.useMemo(
    () => (personalSpaceLoading || !data ? null : browseSidebarMemberSpaceIds(data, personalSpaceId)),
    [data, personalSpaceId, personalSpaceLoading]
  );

  return { allowlist, memberSpaceIds, isLoading: personalSpaceLoading || (enabled && isLoading) };
}
