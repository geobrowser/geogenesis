'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { createSubspaceProposal } from '@geogenesis/sdk/proto';
import { Effect } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { uploadBinary } from '~/core/io/storage/storage';
import { Services } from '~/core/services';

export function useProposeToAddSubspace(args: { votingPluginAddress: string | null; spacePluginAddress: string }) {
  const { storageClient } = Services.useServices();
  const tx = useSmartAccountTransaction({
    address: args.votingPluginAddress,
  });

  // @TODO(baiirun): What should this API look like in the SDK?
  const write = async (subspaceAddress: string) => {
    if (!args.spacePluginAddress) {
      return null;
    }

    const proposal = createSubspaceProposal({
      name: 'Add subspace',
      type: 'ADD_SUBSPACE',
      spaceAddress: subspaceAddress as `0x${string}`, // Some governance space
    });

    const writeTxEffect = Effect.gen(function* () {
      const cid = yield* uploadBinary(proposal, storageClient);

      const callData = encodeFunctionData({
        functionName: 'proposeAcceptSubspace',
        abi: MainVotingAbi,
        // @TODO: Function for encoding
        args: [stringToHex(cid), subspaceAddress as `0x${string}`, args.spacePluginAddress as `0x${string}`],
      });

      return yield* tx(callData);
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
