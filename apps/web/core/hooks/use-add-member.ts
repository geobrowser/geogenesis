'use client';

import { PersonalSpaceAdminAbi } from '@graphprotocol/grc-20/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useRouter } from 'next/navigation';
import { encodeFunctionData, isAddress } from 'viem';

import * as React from 'react';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

interface AddMemberArgs {
  pluginAddress: string | null;
  shouldRefreshOnSuccess?: boolean;
}

export function useAddMember(args: AddMemberArgs) {
  const { smartAccount } = useSmartAccount();
  const router = useRouter();
  const [isIdleAgain, setIsIdle] = React.useState(false);

  const { mutate, status } = useMutation({
    onSuccess: () => {
      if (args.shouldRefreshOnSuccess) {
        // @TODO: Might make more sense to call a server action somewhere to revalidate the page?
        // The main problem is that the transaction has to occur on the client side, so adding
        // piping to call the server after the client-side transaction finishes is kinda wonky vs
        // just calling router.refresh() directly. Using a server action with revalidateTag will
        // let us more granularly revalidate the page though which might result in less data transfer.
        router.refresh();
      }

      // Set back to idle after 3 seconds
      setTimeout(() => setIsIdle(true), 3000);
    },
    mutationFn: async (memberToAdd: string) => {
      if (!args.pluginAddress || !smartAccount) {
        return;
      }

      if (!isAddress(memberToAdd)) {
        return;
      }

      const writeTxEffect = Effect.gen(function* () {
        // We don't need offchain data for personal space membership actions as
        // there are no proposals created for them. We really only need offchain
        // data to disambiguate between the proposal types in the substream.
        const callData = encodeFunctionData({
          functionName: 'submitNewMember',
          abi: PersonalSpaceAdminAbi,
          args: [memberToAdd as `0x${string}`],
        });

        const hash = yield* Effect.tryPromise({
          try: () =>
            smartAccount.sendTransaction({
              to: args.pluginAddress as `0x${string}`,
              value: 0n,
              data: callData,
            }),
          catch: error =>
            new TransactionWriteFailedError(
              `Adding member in space with plugin address ${args.pluginAddress} failed: ${error}`
            ),
        });

        console.log('Transaction hash: ', hash);
        return hash;
      });

      await Effect.runPromise(writeTxEffect);
    },
  });

  return {
    addMember: mutate,
    status: isIdleAgain ? 'idle' : status,
  };
}
