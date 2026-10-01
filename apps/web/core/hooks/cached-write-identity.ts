'use client';

import type { GeoWalletClient } from '@geogenesis/auth/account';
import type { QueryClient } from '@tanstack/react-query';

import { personalSpaceIdQueryKey } from './use-personal-space-id';

type PersonalSpaceIdCache = { isRegistered: boolean; personalSpaceId: string | null };

/**
 * Prefer the live hook value; otherwise trust the cached smart account, if there is only one.
 *
 * "Only one" means one *account*, not one cache entry. The query is keyed on the wagmi wallet's
 * address as well as the embedded wallet's, and the wagmi side is undefined until Privy's login
 * sets the active wallet — so a fresh sign-up caches the same account under two keys. Counting
 * entries read that as ambiguous and returned nothing, and a vote queued before sign-up then
 * failed on replay with "You need a registered personal space to respond". Two genuinely
 * different accounts are still ambiguous and still return null.
 */
export function readCachedSmartAccount(
  queryClient: QueryClient,
  live: GeoWalletClient | null | undefined
): GeoWalletClient | null {
  if (live) return live;
  const cachedAccounts = queryClient
    .getQueriesData<GeoWalletClient | null>({ queryKey: ['smart-account'] })
    .map(([, cached]) => cached)
    .filter((cached): cached is GeoWalletClient => Boolean(cached));
  const addresses = new Set(cachedAccounts.map(cached => cached.account.address.toLowerCase()));
  return addresses.size === 1 ? cachedAccounts[0] : null;
}

export function readCachedPersonalSpace(
  queryClient: QueryClient,
  address: string | null | undefined
): { personalSpaceId: string | null; isRegistered: boolean } {
  const cached = queryClient.getQueryData<PersonalSpaceIdCache>(personalSpaceIdQueryKey(address));
  return {
    personalSpaceId: cached?.personalSpaceId ?? null,
    isRegistered: cached?.isRegistered ?? false,
  };
}
