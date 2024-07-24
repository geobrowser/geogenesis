'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { createMembershipProposal } from '@geogenesis/sdk/proto';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';

import { IpfsEffectClient } from '../io/ipfs-client';

export function useRequestToBeEditor(votingPluginAddress: string | null) {
  const smartAccount = useSmartAccount();
  const tx = useSmartAccountTransaction({
    address: votingPluginAddress,
  });

  const { mutate, status } = useMutation({
    mutationFn: async () => {
      if (!smartAccount) {
        return;
      }

      const proposal = createMembershipProposal({
        name: 'Editor request',
        type: 'ADD_EDITOR',
        userAddress: smartAccount.account.address,
      });

      const writeTxEffect = Effect.gen(function* () {
        const cid = yield* IpfsEffectClient.upload(proposal);

        const callData = encodeFunctionData({
          functionName: 'proposeAddEditor',
          abi: MainVotingAbi,
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
    },
  });

  return {
    requestToBeEditor: mutate,
    status,
  };
}
