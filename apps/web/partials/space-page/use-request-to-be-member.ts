'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { createMembershipProposal } from '@geogenesis/sdk/proto';
import { Effect } from 'effect';
import { encodeFunctionData, getAddress, stringToHex } from 'viem';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { uploadBinary } from '~/core/io/storage/storage';
import { Services } from '~/core/services';

export function useRequestToBeMember(votingPluginAddress: string | null) {
  const { storageClient } = Services.useServices();
  const smartAccount = useSmartAccount();
  const tx = useSmartAccountTransaction({
    address: votingPluginAddress,
  });

  const write = async () => {
    if (!smartAccount) {
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
    requestToBeMember: write,
  };
}
