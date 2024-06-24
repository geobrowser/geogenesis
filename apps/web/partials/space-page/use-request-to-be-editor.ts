'use client';

import { createMembershipProposal, getAcceptEditorArguments } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { Effect, Schedule } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import { useAccount, useConfig } from 'wagmi';
import { simulateContract, writeContract } from 'wagmi/actions';

import { InvalidIpfsQmHashError, IpfsUploadError, TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { uploadBinary } from '~/core/io/storage/storage';
import { Services } from '~/core/services';

export function useRequestToBeEditor(votingPluginAddress: string | null) {
  const { storageClient } = Services.useServices();
  const smartAccount = useSmartAccount();

  // @TODO(baiirun): What should this API look like in the SDK?
  const write = async () => {
    if (!votingPluginAddress || !smartAccount) {
      return null;
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
    requestToBeEditor: write,
  };
}
