import { DaoSpaceAbi, SpaceRegistryAbi } from '@geoprotocol/geo-sdk/abis';

import { type Hex, createPublicClient, http, zeroAddress } from 'viem';

import { validateSpaceId } from '~/core/io/rest/validation';
import { SPACE_REGISTRY_ADDRESS, assertSpaceRegistryDeployed } from '~/core/sdk/geo-network';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

import { FAST_PATH_RESTRICTED_ROLE, SPACE_MEMBER_ROLE } from './space-registry';

/**
 * Read whether `memberSpaceId` holds `role` in `spaceId`'s DAO, from the chain, where a change is
 * immediately visible even if the indexer still serves the old state. Resolve the DAO through the
 * registry so a migrated space's cached address is never used.
 * Throws if the read fails; an unreadable DAO must not read as "doesn't hold the role".
 */
export async function readSpaceRole(spaceId: string, memberSpaceId: string, role: Hex): Promise<boolean> {
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
    args: [role, `0x${member}`],
  });
}

/** Current on-chain membership; see `readSpaceRole`. */
export function readSpaceMembership(spaceId: string, memberSpaceId: string): Promise<boolean> {
  return readSpaceRole(spaceId, memberSpaceId, SPACE_MEMBER_ROLE);
}

/** Whether a space is on the review path only in `spaceId`'s DAO; see `readSpaceRole`. */
export function readFastPathRestricted(spaceId: string, memberSpaceId: string): Promise<boolean> {
  return readSpaceRole(spaceId, memberSpaceId, FAST_PATH_RESTRICTED_ROLE);
}
