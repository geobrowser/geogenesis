import { keccak256, stringToHex, zeroAddress } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readFastPathRestricted, readSpaceMembership } from './read-space-membership';

const mocks = vi.hoisted(() => ({ readContract: vi.fn(), assertDeployed: vi.fn() }));
vi.mock('viem', async importOriginal => ({
  ...(await importOriginal<typeof import('viem')>()),
  createPublicClient: () => ({ readContract: mocks.readContract }),
}));
vi.mock('~/core/sdk/geo-network', () => ({
  SPACE_REGISTRY_ADDRESS: '0x1111111111111111111111111111111111111111',
  assertSpaceRegistryDeployed: mocks.assertDeployed,
}));
vi.mock('~/core/wallet/geo-chain', () => ({ GEOGENESIS: { id: 55516 } }));

const SPACE = '41E85161-0E13-A194-41C4-D980F2F2CE6B';
const MEMBER = 'b7c1aa0e3f2d4c5b9a8e7d6c5b4a3f21';
const DAO = '0x2222222222222222222222222222222222222222';

beforeEach(() => {
  mocks.readContract.mockReset();
  mocks.assertDeployed.mockReset();
  mocks.assertDeployed.mockResolvedValue(undefined);
});

describe('readSpaceMembership', () => {
  it.each([true, false])('reads current MEMBER standing (%s) from the registry-resolved DAO', async member => {
    mocks.readContract.mockResolvedValueOnce(DAO).mockResolvedValueOnce(member);

    await expect(readSpaceMembership(SPACE, MEMBER)).resolves.toBe(member);

    expect(mocks.assertDeployed).toHaveBeenCalledOnce();
    expect(mocks.readContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: '0x1111111111111111111111111111111111111111',
        functionName: 'spaceIdToAddress',
        args: ['0x41e851610e13a19441c4d980f2f2ce6b'],
      })
    );
    expect(mocks.readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        address: DAO,
        functionName: 'hasRole',
        args: [keccak256(stringToHex('MEMBER')), `0x${MEMBER}`],
      })
    );
  });

  it('rejects an unregistered space instead of treating it as an already-completed leave', async () => {
    mocks.readContract.mockResolvedValueOnce(zeroAddress);
    await expect(readSpaceMembership(SPACE, MEMBER)).rejects.toThrow('not registered');
    expect(mocks.readContract).toHaveBeenCalledOnce();
  });

  it('propagates failed membership reads instead of reporting absence', async () => {
    mocks.readContract.mockResolvedValueOnce(DAO).mockRejectedValueOnce(new Error('RPC unavailable'));
    await expect(readSpaceMembership(SPACE, MEMBER)).rejects.toThrow('RPC unavailable');
  });

  it('refuses to read from an undeployed registry', async () => {
    mocks.assertDeployed.mockRejectedValueOnce(new Error('No contract code'));
    await expect(readSpaceMembership(SPACE, MEMBER)).rejects.toThrow('No contract code');
    expect(mocks.readContract).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', MEMBER],
    [SPACE, 'pending:viewer'],
  ])('rejects invalid identities', async (space, member) => {
    await expect(readSpaceMembership(space, member)).rejects.toThrow('Invalid space ID');
    expect(mocks.readContract).not.toHaveBeenCalled();
  });
});

describe('readFastPathRestricted', () => {
  const RESTRICTED_ROLE = keccak256(stringToHex('FAST_PATH_RESTRICTED'));

  it.each([true, false])(
    'reads the role (%s) from the registry-resolved DAO, asking the DAO for its id',
    async held => {
      mocks.readContract.mockResolvedValueOnce(DAO).mockResolvedValueOnce(RESTRICTED_ROLE).mockResolvedValueOnce(held);

      await expect(readFastPathRestricted(SPACE, MEMBER)).resolves.toBe(held);

      expect(mocks.readContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ address: DAO, functionName: 'FAST_PATH_RESTRICTED' })
      );
      expect(mocks.readContract).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ address: DAO, functionName: 'hasRole', args: [RESTRICTED_ROLE, `0x${MEMBER}`] })
      );
    }
  );

  it('propagates a failed read so the caller picks which way to fail', async () => {
    mocks.readContract.mockResolvedValueOnce(DAO).mockRejectedValueOnce(new Error('RPC unavailable'));
    await expect(readFastPathRestricted(SPACE, MEMBER)).rejects.toThrow('RPC unavailable');
  });
});
