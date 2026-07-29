import { DaoSpaceAbi } from '@geoprotocol/geo-sdk/abis';

import { createPublicClient, http } from 'viem';

import { GEOGENESIS } from '~/core/wallet/geo-chain';

/**
 * Whether a proposal has already been executed on-chain.
 *
 * A FAST proposal executes inside the YES vote transaction as soon as that vote takes it past the
 * fast-path threshold, and with the voting settings Geo spaces ship (`fastPathFlatThreshold: 0`,
 * `quorum: 1`) the author's own first vote always does. The explicit execute that follows then
 * reverts with `CanNotExecute()` (0xdf322356) against an edit that is already live, so check this
 * after voting instead of reporting a publish that landed as a failure.
 *
 * Returns `null` when the chain can't be read, so callers attempt the execute anyway rather than
 * skipping it on an unreachable RPC.
 */
export async function isProposalExecuted({
  daoSpaceAddress,
  proposalId,
  rpcUrl,
}: {
  daoSpaceAddress: `0x${string}`;
  /** bytes16 proposal id, `0x` prefixed. */
  proposalId: `0x${string}`;
  rpcUrl?: string;
}): Promise<boolean | null> {
  try {
    const publicClient = createPublicClient({ chain: GEOGENESIS, transport: http(rpcUrl) });

    const [executed] = await publicClient.readContract({
      address: daoSpaceAddress,
      abi: DaoSpaceAbi,
      functionName: 'getLatestProposalInformation',
      args: [proposalId],
    });

    return executed;
  } catch {
    return null;
  }
}
