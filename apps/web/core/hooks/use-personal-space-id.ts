'use client';

import { useQuery } from '@tanstack/react-query';
import { type Hex, createPublicClient, http } from 'viem';

import {
  EMPTY_SPACE_ID_HEX,
  SPACE_REGISTRY_ADDRESS_HEX,
  SpaceRegistryAbi,
} from '~/core/utils/contracts/space-registry';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { useSmartAccount } from './use-smart-account';

/** Hook to get the user's personal space ID from the SpaceRegistry contract. */
export function usePersonalSpaceId() {
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['personal-space-id', address],
    queryFn: async () => {
      if (!address) return null;

      const publicClient = createPublicClient({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chain: GEOGENESIS as any,
        transport: http(),
      });

      const spaceIdHex = (await publicClient.readContract({
        address: SPACE_REGISTRY_ADDRESS_HEX,
        abi: SpaceRegistryAbi,
        functionName: 'addressToSpaceId',
        args: [address as Hex],
      })) as Hex;

      if (spaceIdHex.toLowerCase() === EMPTY_SPACE_ID_HEX.toLowerCase()) {
        return { isRegistered: false, personalSpaceId: null };
      }

      // Remove 0x prefix and use hex format (no hyphens)
      const personalSpaceId = spaceIdHex.slice(2).toLowerCase();

      return { isRegistered: true, personalSpaceId };
    },
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    personalSpaceId: data?.personalSpaceId ?? null,
    isRegistered: data?.isRegistered ?? false,
    isLoading,
    isFetched,
  };
}
