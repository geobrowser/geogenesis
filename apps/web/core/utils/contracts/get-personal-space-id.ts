import { type Hex, createPublicClient, http } from 'viem';

import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { EMPTY_SPACE_ID_HEX, SPACE_REGISTRY_ADDRESS_HEX, SpaceRegistryAbi } from './space-registry';

/** Look up a user's personal space ID from their wallet address. */
export async function getPersonalSpaceId(walletAddress: string): Promise<string | null> {
  const publicClient = createPublicClient({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain: GEOGENESIS as any,
    transport: http(),
  });

  const spaceIdHex = (await publicClient.readContract({
    address: SPACE_REGISTRY_ADDRESS_HEX,
    abi: SpaceRegistryAbi,
    functionName: 'addressToSpaceId',
    args: [walletAddress as Hex],
  })) as Hex;

  if (spaceIdHex.toLowerCase() === EMPTY_SPACE_ID_HEX.toLowerCase()) {
    return null;
  }

  // Remove 0x prefix and return hex format (no hyphens)
  return spaceIdHex.slice(2).toLowerCase();
}
