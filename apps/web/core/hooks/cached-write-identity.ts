'use client';

import type { GeoWalletClient } from '@geogenesis/auth/account';
import type { QueryClient } from '@tanstack/react-query';

import { personalSpaceIdQueryKey } from './use-personal-space-id';

type PersonalSpaceIdCache = { isRegistered: boolean; personalSpaceId: string | null };

/** Prefer the live hook value; otherwise trust the sole cached smart account. */
export function readCachedSmartAccount(
  queryClient: QueryClient,
  live: GeoWalletClient | null | undefined
): GeoWalletClient | null {
  if (live) return live;
  const cachedAccounts = queryClient
    .getQueriesData<GeoWalletClient | null>({ queryKey: ['smart-account'] })
    .map(([, cached]) => cached)
    .filter((cached): cached is GeoWalletClient => Boolean(cached));
  return cachedAccounts.length === 1 ? cachedAccounts[0] : null;
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
