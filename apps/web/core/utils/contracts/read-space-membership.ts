import { DaoSpaceAbi, SpaceRegistryAbi } from '@geoprotocol/geo-sdk/abis';

import { type Hex, createPublicClient, http, zeroAddress } from 'viem';

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
  return readSpaceRole(spaceId, memberSpaceId, () => SPACE_MEMBER_ROLE);
}

/**
 * Whether `memberSpaceId` holds FAST_PATH_RESTRICTED in this DAO space.
 *
 * A DAO created with `disableFastPathAccessForNewMembers` grants that role to every
 * member it adds, and leaving (or being removed) revokes MEMBER but not the
 * restriction. A membership request is a fast-path proposal, so the contract rejects
 * one from a holder with `FastPathRestricted()`: someone who left can't ask to come
 * back, and only an editor's proposal can re-add them (GEO-3632). Editors can also
 * restrict a space directly, which blocks requests the same way.
 *
 * Throws if the read fails, like `readSpaceMembership`; callers decide which way to fail.
 */
export async function readFastPathRestricted(spaceId: string, memberSpaceId: string): Promise<boolean> {
  return readSpaceRole(spaceId, memberSpaceId, (client, dao) =>
    client.readContract({ address: dao, abi: DaoSpaceAbi, functionName: 'FAST_PATH_RESTRICTED' })
  );
}

type GeoPublicClient = ReturnType<typeof createGeoPublicClient>;

function createGeoPublicClient() {
  return createPublicClient({ chain: GEOGENESIS, transport: http() });
}

async function readSpaceRole(
  spaceId: string,
  memberSpaceId: string,
  role: (client: GeoPublicClient, dao: Hex) => Hex | Promise<Hex>
): Promise<boolean> {
  const target = validateSpaceId(spaceId);
  const member = validateSpaceId(memberSpaceId);
  if (!target || !member) throw new Error('Invalid space ID');

  await assertSpaceRegistryDeployed();
  const client = createGeoPublicClient();
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
    args: [await role(client, address), `0x${member}`],
  });
}
