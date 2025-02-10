'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { encodeFunctionData } from 'viem';

import { useCallback } from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useStatusBar } from '~/core/state/status-bar-store';

export function useRequestToBeEditor(votingPluginAddress: string | null) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const tx = useSmartAccountTransaction({
    address: votingPluginAddress,
  });

  const handleRequestToBeEditor = useCallback(async () => {
    if (!smartAccount) {
      return;
    }

    console.log('requesting to be editor', smartAccount);

    const writeTxEffect = Effect.gen(function* () {
      const callData = encodeFunctionData({
        functionName: 'proposeAddEditor',
        abi: MainVotingAbi,
        args: ['0x', smartAccount.account.address],
      });

      const hash = yield* tx(callData);
      console.log('Transaction hash: ', hash);
      return hash;
    });

    const result = await Effect.runPromise(Effect.either(writeTxEffect));

    Either.match(result, {
      onLeft: error => {
        console.error(error);
        dispatch({ type: 'ERROR', payload: `${error}`, retry: handleRequestToBeEditor });
        // Necessary to propogate error status to useMutation
        throw error;
      },
      onRight: () => console.log('Successfully requested to be editor'),
    });
  }, [dispatch, smartAccount, tx]);

  const { mutate, status } = useMutation({
    mutationFn: handleRequestToBeEditor,
  });

  return {
    requestToBeEditor: mutate,
    status,
  };
}
