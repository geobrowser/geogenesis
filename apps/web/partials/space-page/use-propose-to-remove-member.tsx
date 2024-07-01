'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { createMembershipProposal } from '@geogenesis/sdk/proto';
import { Effect } from 'effect';
import { encodeFunctionData, getAddress, stringToHex } from 'viem';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { uploadBinary } from '~/core/io/storage/storage';
import { Services } from '~/core/services';

export function useProposeToRemoveMember(votingPluginAddress: string | null) {
  const { storageClient } = Services.useServices();
  const smartAccount = useSmartAccount();

  const write = async (editorToRemove: string) => {
    if (!votingPluginAddress || !smartAccount) {
      return;
    }

    const membershipProposalMetadata = createMembershipProposal({
      name: 'Remove member request',
      type: 'REMOVE_MEMBER',
      userAddress: getAddress(editorToRemove) as `0x${string}`,
    });

    const writeTxEffect = Effect.gen(function* () {
      const cid = yield* uploadBinary(membershipProposalMetadata, storageClient);

      const callData = encodeFunctionData({
        functionName: 'proposeRemoveMember',
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
    proposeToRemoveMember: write,
  };
}
