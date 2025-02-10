'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { encodeFunctionData, getAddress } from 'viem';

import { useCallback } from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useStatusBar } from '~/core/state/status-bar-store';

export function useRequestToBeMember(votingPluginAddress: string | null) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const tx = useSmartAccountTransaction({
    address: votingPluginAddress,
  });

  const handleRequestToBeMember = useCallback(async () => {
    if (!smartAccount) {
      return null;
    }

    const requestorAddress = getAddress(smartAccount.account.address);

    console.log('Requesting to be member', { smartAccount, contract: votingPluginAddress });

    const writeTxEffect = Effect.gen(function* () {
      const callData = encodeFunctionData({
        functionName: 'proposeAddMember',
        abi: MainVotingAbi,
        args: ['0x', requestorAddress],
      });

      const hash = yield* tx(callData);
      console.log('Transaction hash: ', hash);
      return hash;
    });

    const result = await Effect.runPromise(Effect.either(writeTxEffect));

    Either.match(result, {
      onLeft: error => {
        console.error(error);
        dispatch({ type: 'ERROR', payload: `${error}`, retry: handleRequestToBeMember });
        // Necessary to propogate error status to useMutation
        throw error;
      },
      onRight: () => console.log('Successfully requested to be member'),
    });
  }, [dispatch, smartAccount, tx, votingPluginAddress]);

  const { mutate, status } = useMutation({
    mutationFn: handleRequestToBeMember,
  });

  return {
    requestToBeMember: mutate,
    status,
  };
}
