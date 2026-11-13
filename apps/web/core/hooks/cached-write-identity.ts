'use client';

import type { GeoWalletClient } from '@geogenesis/auth/account';
import type { QueryClient } from '@tanstack/react-query';

import {
  SignedOutBeforeWriteError,
  SigningAccountFailedError,
  publishedAccountAddress,
  waitForSigningAccount,
} from '~/core/wallet/account-readiness';

import { personalSpaceIdQueryKey } from './use-personal-space-id';

type PersonalSpaceIdCache = { isRegistered: boolean; personalSpaceId: string | null };

/**
 * Prefer the live hook value; otherwise trust the cached smart account, if there is only one.
 *
 * "Only one" means one *account*: two different accounts cached in one tab (a sign-out and a
 * sign-in as someone else) are ambiguous, and return null.
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

/** The account to write with, waiting for it while it is built. Null if signed out or the build failed. */
export async function awaitSigningAccount(
  queryClient: QueryClient,
  live: GeoWalletClient | null | undefined
): Promise<GeoWalletClient | null> {
  const account = readCachedSmartAccount(queryClient, live);
  if (account) return account;
  try {
    return await waitForSigningAccount();
  } catch (error) {
    if (error instanceof SignedOutBeforeWriteError || error instanceof SigningAccountFailedError) return null;
    throw error;
  }
}

export function readAccountAddress(queryClient: QueryClient): string | null {
  return publishedAccountAddress() ?? readCachedSmartAccount(queryClient, null)?.account.address ?? null;
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

/**
 * The registered personal space to write from: this render's when it has one, otherwise the cache's.
 *
 * For a write a queued action replays — through a closure taken at the press, before sign-up, when
 * the render had no space; the cache has it by the time the runner fires. Null when neither has a
 * registered space.
 */
export function readRegisteredPersonalSpaceId(
  queryClient: QueryClient,
  address: string | null | undefined,
  live: { personalSpaceId: string | null; isRegistered: boolean }
): string | null {
  const space = live.personalSpaceId && live.isRegistered ? live : readCachedPersonalSpace(queryClient, address);
  return space.isRegistered ? space.personalSpaceId : null;
}
