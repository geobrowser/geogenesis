import { describe, expect, it, vi } from 'vitest';

import { isProposalExecuted } from './proposal-execution';

const readContract = vi.fn();

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return { ...actual, createPublicClient: () => ({ readContract }) };
});

vi.mock('~/core/wallet/geo-chain', () => ({ GEOGENESIS: { id: 19411 } }));

const ARGS = {
  daoSpaceAddress: '0x0C5D1e402C8aAa0e0326c6ef9dfDF7f9C37dDced',
  proposalId: '0x92957f518aeb40de8004dca1f0c3e8bf',
} as const;

/** `getLatestProposalInformation` returns [executed, creator, parameters, tally, actions]. */
function proposalInformation(executed: boolean) {
  return [executed, '0x88883e1ec8261b8ac323f564e272b5be', {}, {}, []];
}

describe('isProposalExecuted', () => {
  it('is true for a proposal the vote already executed', async () => {
    readContract.mockResolvedValueOnce(proposalInformation(true));
    await expect(isProposalExecuted(ARGS)).resolves.toBe(true);
  });

  it('is false for a proposal still awaiting execution', async () => {
    readContract.mockResolvedValueOnce(proposalInformation(false));
    await expect(isProposalExecuted(ARGS)).resolves.toBe(false);
  });

  it('is null when the chain cannot be read, so callers still attempt the execute', async () => {
    readContract.mockRejectedValueOnce(new Error('RPC unreachable'));
    await expect(isProposalExecuted(ARGS)).resolves.toBeNull();
  });

  it('reads the proposal off the DAO space contract, not the space registry', async () => {
    readContract.mockResolvedValueOnce(proposalInformation(true));
    await isProposalExecuted(ARGS);

    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ARGS.daoSpaceAddress,
        functionName: 'getLatestProposalInformation',
        args: [ARGS.proposalId],
      })
    );
  });
});
