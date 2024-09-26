'use client';

import { MainVotingAbi } from '@geobrowser/gdk/abis';
import { createMembershipProposal } from '@geobrowser/gdk/proto';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { encodeFunctionData, getAddress, stringToHex } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';

import { IpfsEffectClient } from '../io/ipfs-client';

export function useRequestToBeMember(votingPluginAddress: string | null) {
  const smartAccount = useSmartAccount();
  const tx = useSmartAccountTransaction({
    address: votingPluginAddress,
  });

  const { mutate, status } = useMutation({
    mutationFn: async () => {
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
        const cid = yield* IpfsEffectClient.upload(proposal);

        const callData = encodeFunctionData({
          functionName: 'proposeAddMember',
          abi: MainVotingAbi,
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
    },
  });

  return {
    requestToBeMember: mutate,
    status,
  };
}
