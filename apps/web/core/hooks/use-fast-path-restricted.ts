'use client';

import { DaoSpaceAbi } from '@geoprotocol/geo-sdk/abis';
import { useQuery } from '@tanstack/react-query';

import { createPublicClient, http } from 'viem';

import { GEOGENESIS } from '~/core/wallet/geo-chain';

/**
 * Whether this author is barred from the fast path in a given DAO space.
 *
 * A DAO created with `disableFastPathAccessForNewMembers` grants incoming members the
 * FAST_PATH_RESTRICTED role, and a fast-path proposal from a holder reverts
 * `FastPathRestricted()` (0x3a9c66d4) during gas simulation — before anything is
 * submitted. Offering the choice anyway meant new members picked a path that could
 * never work, so the selector asks the space directly.
 *
 * The role is per (space, author) and only changes on an explicit governance action,
 * so it's cached for the session rather than refetched on mount like votingSettings.
 *
 * Fails OPEN (returns false, meaning unrestricted) when the space or author is unknown
 * or the read errors: a flaky RPC must not remove a path the user is entitled to. The
 * contract remains the enforcement point either way — this only decides what the UI
 * offers.
 */
export function useIsFastPathRestricted(spaceAddress?: string, authorSpaceId?: string | null, enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: ['fast-path-restricted', spaceAddress?.toLowerCase(), authorSpaceId],
    enabled: Boolean(spaceAddress) && Boolean(authorSpaceId) && enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<boolean> => {
      if (!spaceAddress || !authorSpaceId) return false;

      try {
        const publicClient = createPublicClient({ chain: GEOGENESIS, transport: http() });
        const address = spaceAddress as `0x${string}`;

        const role = await publicClient.readContract({
          address,
          abi: DaoSpaceAbi,
          functionName: 'FAST_PATH_RESTRICTED',
        });

        return await publicClient.readContract({
          address,
          abi: DaoSpaceAbi,
          functionName: 'hasRole',
          args: [role, `0x${authorSpaceId.replace(/-/g, '')}` as `0x${string}`],
        });
      } catch {
        return false;
      }
    },
  });

  return { isFastPathRestricted: data ?? false, isLoading };
}
