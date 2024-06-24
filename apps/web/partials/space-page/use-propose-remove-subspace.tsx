'use client';

import { createSubspaceProposal } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { Effect } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { uploadBinary } from '~/core/io/storage/storage';
import { Services } from '~/core/services';

export function useProposeToAddSubspace(args: { votingPluginAddress: string | null; spacePluginAddress: string }) {
  const { storageClient } = Services.useServices();
  const smartAccount = useSmartAccount();

  // @TODO(baiirun): What should this API look like in the SDK?
  const write = async (subspaceAddress: string) => {
    if (!args.votingPluginAddress || !args.spacePluginAddress || !smartAccount) {
      return null;
    }

    const proposal = createSubspaceProposal({
      name: 'Remove subspace',
      type: 'REMOVE_SUBSPACE',
      spaceAddress: subspaceAddress as `0x${string}`, // Some governance space
    });

    const writeTxEffect = Effect.gen(function* () {
      const cid = yield* uploadBinary(proposal, storageClient);

      const callData = encodeFunctionData({
        functionName: 'proposeRemoveSubspace',
        abi: MainVotingAbi,
        // @TODO: Function for encoding
        args: [stringToHex(cid), subspaceAddress as `0x${string}`, args.spacePluginAddress as `0x${string}`],
      });

      return yield* Effect.tryPromise({
        try: () =>
          smartAccount.sendTransaction({
            to: args.votingPluginAddress as `0x${string}`,
            value: 0n,
            data: callData,
          }),
        catch: error => new TransactionWriteFailedError(`Publish failed: ${error}`),
      });
    });

    const publishProgram = Effect.gen(function* () {
      const writeTxHash = yield* writeTxEffect;
      console.log('Transaction hash: ', writeTxHash);
      return writeTxHash;
    });

    await Effect.runPromise(publishProgram);
  };

  return {
    proposeAddSubspace: write,
  };
}
