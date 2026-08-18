'use client';

import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { browseSidebarDataQueryKey } from './browse-sidebar-query';
import type { BrowseSidebarData } from './fetch-browse-sidebar-data';

export type BrowseSidebarQuerySource = {
  personalSpaceId: string | null;
  walletAddress: string | undefined;
  /** What the sidebar's query key is built from. */
  keyInput: string | null;
  /** Whether the account behind {@link keyInput} has settled. */
  isLoading: boolean;
};

/**
 * What `BrowseSidebar` keys its own query on: the viewer's personal space, falling back to their
 * wallet address while that resolves (and to null when there is neither).
 *
 * Anything that wants to share the sidebar's cache entry has to derive the key the same way, so
 * this is the one definition of it.
 */
export function useBrowseSidebarQuerySource(): BrowseSidebarQuerySource {
  const { personalSpaceId, isLoading } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;

  return { personalSpaceId, walletAddress, keyInput: personalSpaceId ?? walletAddress ?? null, isLoading };
}

/**
 * The browse sidebar's data if it is already in the cache, without fetching it.
 *
 * `BrowseSidebar` mounts on every page (`app/entry.tsx`) and loads this on its own, so by the time
 * any panel opens the rows are usually sitting there — names, images and all. `skipToken` keeps
 * this a pure read: it subscribes to the entry so a consumer re-renders when the sidebar's own
 * fetch lands, but never starts a second one.
 */
export function useCachedBrowseSidebarData(): BrowseSidebarData | null {
  const queryClient = useQueryClient();
  const { keyInput } = useBrowseSidebarQuerySource();
  const queryKey = browseSidebarDataQueryKey(keyInput);

  const { data = null } = useQuery<BrowseSidebarData | null>({
    queryKey,
    queryFn: skipToken,
    placeholderData: () => queryClient.getQueryData<BrowseSidebarData>(queryKey) ?? null,
  });

  return data;
}
