'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { createMembershipProposal } from '@geogenesis/sdk/proto';
import { Effect } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { uploadBinary } from '~/core/io/storage/storage';
import { Services } from '~/core/services';

export function useRequestToBeEditor(votingPluginAddress: string | null) {
  const { storageClient } = Services.useServices();
  const smartAccount = useSmartAccount();
  const tx = useSmartAccountTransaction({
    address: votingPluginAddress,
  });

  // @TODO(baiirun): What should this API look like in the SDK?
  const write = async () => {
    if (!smartAccount) {
      return;
    }

    const proposal = createMembershipProposal({
      name: 'Editor request',
      type: 'ADD_EDITOR',
      userAddress: smartAccount.account.address,
    });

    const writeTxEffect = Effect.gen(function* () {
      const cid = yield* uploadBinary(proposal, storageClient);

      const callData = encodeFunctionData({
        functionName: 'proposeAddEditor',
        abi: MainVotingAbi,
        // @TODO: Function for encoding
        args: [stringToHex(cid), smartAccount.account.address],
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
    requestToBeEditor: write,
  };
}
