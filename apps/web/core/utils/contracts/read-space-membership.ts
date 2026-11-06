import { DaoSpaceAbi, SpaceRegistryAbi } from '@geoprotocol/geo-sdk/abis';

import { createPublicClient, http, zeroAddress } from 'viem';

import { validateSpaceId } from '~/core/io/rest/validation';
import { SPACE_REGISTRY_ADDRESS, assertSpaceRegistryDeployed } from '~/core/sdk/geo-network';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { SPACE_MEMBER_ROLE } from './space-registry';

/**
 * Read current membership from the chain, where a confirmed leave is immediately
 * visible even if the indexer still serves the old membership. Resolve the DAO
 * through the registry so a migrated space's cached address is never used.
 * Throws if the read fails; absence of a readable DAO must not mean "already left".
 */
export async function readSpaceMembership(spaceId: string, memberSpaceId: string): Promise<boolean> {
  const target = validateSpaceId(spaceId);
  const member = validateSpaceId(memberSpaceId);
  if (!target || !member) throw new Error('Invalid space ID');

  await assertSpaceRegistryDeployed();
  const client = createPublicClient({ chain: GEOGENESIS, transport: http() });
  const address = await client.readContract({
    address: SPACE_REGISTRY_ADDRESS,
    abi: SpaceRegistryAbi,
    functionName: 'spaceIdToAddress',
    args: [`0x${target}`],
  });
  if (address === zeroAddress) throw new Error('This space is not registered on-chain');

  return client.readContract({
    address,
    abi: DaoSpaceAbi,
    functionName: 'hasRole',
    args: [SPACE_MEMBER_ROLE, `0x${member}`],
  });
}
