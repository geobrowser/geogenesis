'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { browseSidebarDataQueryKey } from '~/core/browse/browse-sidebar-query';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { loadBrowseSidebarData } from '~/partials/browse-sidebar/load-browse-sidebar-data';

import { browseSidebarClaimSpaceAllowlist } from './claim-space-allowlist';

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
 * rather than "nothing is allowed".
 */
export function useClaimSpaceAllowlist(): { allowlist: Set<string> | null; isLoading: boolean } {
  const { personalSpaceId, isLoading: personalSpaceLoading } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;

  // Held until the account and the personal space both resolve (`usePersonalSpaceId` waits on the
  // smart account itself). Fetching before then would key and cache a featured-only sidebar — the
  // signed-out answer — under the no-wallet key for a signed-in viewer, and drop their own spaces
  // out of the allowlist for as long as that entry stayed fresh.
  const enabled = !personalSpaceLoading;

  const { data, isLoading } = useQuery({
    queryKey: browseSidebarDataQueryKey(personalSpaceId ?? walletAddress ?? null),
    queryFn: () => (personalSpaceId ? fetchBrowseSidebarData(personalSpaceId) : loadBrowseSidebarData(walletAddress)),
    enabled,
    staleTime: 60_000,
  });

  const allowlist = React.useMemo(
    () => (data ? browseSidebarClaimSpaceAllowlist(data, personalSpaceId) : null),
    [data, personalSpaceId]
  );

  return { allowlist, isLoading: personalSpaceLoading || (enabled && isLoading) };
}
