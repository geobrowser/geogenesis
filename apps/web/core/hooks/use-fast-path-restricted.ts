'use client';

import { useQuery } from '@tanstack/react-query';

import { createPublicClient, http } from 'viem';

import { validateSpaceId } from '~/core/io/rest/validation';
import { DAOSpaceAbi, FAST_PATH_RESTRICTED_ROLE } from '~/core/utils/contracts/space-registry';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

/** Prefix shared by every fast-path restriction read, for invalidation after a change. */
export const FAST_PATH_RESTRICTED_QUERY_KEY = 'fast-path-restricted';

/** Reads whether `spaceId` holds FAST_PATH_RESTRICTED in the DAO at `spaceAddress`. Throws on failure. */
export async function readFastPathRestricted(spaceAddress: string, spaceId: string): Promise<boolean> {
  const id = validateSpaceId(spaceId.replace(/^0x/, ''));
  if (!id) throw new Error('Invalid space ID');

  const publicClient = createPublicClient({ chain: GEOGENESIS, transport: http() });
  return publicClient.readContract({
    address: spaceAddress as `0x${string}`,
    abi: DAOSpaceAbi,
    functionName: 'hasRole',
    args: [FAST_PATH_RESTRICTED_ROLE, `0x${id}`],
  });
}

/**
 * Whether this author is barred from the fast path in a given DAO space.
 *
 * A DAO created with `disableFastPathAccessForNewMembers` grants incoming members the
 * FAST_PATH_RESTRICTED role, and a fast-path proposal from a holder reverts
 * `FastPathRestricted()` (0x3a9c66d4) during gas simulation — before anything is
 * submitted. Offering the choice anyway meant new members picked a path that could
 * never work, so the selector asks the space directly.
 *
 * The role only changes on an explicit editor or governance action, so it's cached for the
 * session rather than refetched on mount like votingSettings.
 *
 * Fails OPEN (returns false, meaning unrestricted) when the space or author is unknown
 * or the read errors: a flaky RPC must not remove a path the user is entitled to. The
 * contract remains the enforcement point either way — this only decides what the UI
 * offers. Editor controls that change the role use `useFastPathRestriction` instead.
 */
export function useIsFastPathRestricted(spaceAddress?: string, authorSpaceId?: string | null, enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: [FAST_PATH_RESTRICTED_QUERY_KEY, spaceAddress?.toLowerCase(), authorSpaceId],
    enabled: Boolean(spaceAddress) && Boolean(authorSpaceId) && enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<boolean> => {
      if (!spaceAddress || !authorSpaceId) return false;
      try {
        return await readFastPathRestricted(spaceAddress, authorSpaceId);
      } catch {
        return false;
      }
    },
  });

  return { isFastPathRestricted: data ?? false, isLoading };
}

/**
 * The same read for editor controls, which act on the answer: fetched fresh each time a control
 * mounts, and an error is reported rather than read as "unrestricted", because acting on a wrong
 * answer sends a transaction that reverts.
 */
export function useFastPathRestriction(spaceAddress?: string, spaceId?: string | null) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [FAST_PATH_RESTRICTED_QUERY_KEY, 'fresh', spaceAddress?.toLowerCase(), spaceId],
    enabled: Boolean(spaceAddress) && Boolean(spaceId),
    staleTime: 0,
    queryFn: () => readFastPathRestricted(spaceAddress!, spaceId!),
  });

  return { isRestricted: data, isLoading, isError };
}
