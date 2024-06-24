'use client';

import { createMembershipProposal } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { Effect } from 'effect';
import { encodeFunctionData, getAddress, stringToHex } from 'viem';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { uploadBinary } from '~/core/io/storage/storage';
import { Services } from '~/core/services';

export function useRequestToBeMember(votingPluginAddress: string | null) {
  const { storageClient } = Services.useServices();
  const smartAccount = useSmartAccount();

  const write = async () => {
    if (!votingPluginAddress || !smartAccount) {
      return null;
    }

    const requestorAddress = getAddress(smartAccount.account.address);

    const proposal = createMembershipProposal({
      name: 'Member request',
      type: 'ADD_MEMBER',
      userAddress: smartAccount.account.address,
    });

    const writeTxEffect = Effect.gen(function* () {
      const cid = yield* uploadBinary(proposal, storageClient);

      const callData = encodeFunctionData({
        functionName: 'proposeAddMember',
        abi: MainVotingAbi,
        // @TODO: Function for encoding
        args: [stringToHex(cid), requestorAddress],
      });

      return yield* Effect.tryPromise({
        try: () =>
          smartAccount.sendTransaction({
            to: votingPluginAddress as `0x${string}`,
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
    requestToBeMember: write,
  };
}
