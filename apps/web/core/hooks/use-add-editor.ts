'use client';

import { PersonalSpaceAdminAbi } from '@geogenesis/sdk/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useRouter } from 'next/navigation';
import { encodeFunctionData, isAddress } from 'viem';

import * as React from 'react';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

interface AddEditorArgs {
  pluginAddress: string | null;
  shouldRefreshOnSuccess?: boolean;
}

export function useAddEditor(args: AddEditorArgs) {
  const smartAccount = useSmartAccount();
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
    mutationFn: async (editorToAdd: string) => {
      if (!args.pluginAddress || !smartAccount) {
        return;
      }

      if (!isAddress(editorToAdd)) {
        return;
      }

      const writeTxEffect = Effect.gen(function* () {
        // We don't need offchain data for personal space membership actions as
        // there are no proposals created for them. We really only need offchain
        // data to disambiguate between the proposal types in the substream.
        const callData = encodeFunctionData({
          functionName: 'submitNewEditor',
          abi: PersonalSpaceAdminAbi,
          args: [editorToAdd as `0x${string}`],
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
              `Adding member in personal space with plugin address ${args.pluginAddress} failed: ${error}`
            ),
        });

        console.log('Transaction hash: ', hash);
        return hash;
      });

      await Effect.runPromise(writeTxEffect).catch(error => {
        throw error;
      });
    },
  });

  return {
    addEditor: mutate,
    status: isIdleAgain ? 'idle' : status,
  };
}

// We eventually might want to be able to add editors manually in public spaces
// as well. Leaving this for now as a guideline for how we can use the same hook
// but with different calldata based on the space type. We also do this already
// in the usePublish and useAdd/RemoveSubspace hooks.
// type GovernanceTypeCalldataArgs =
//   | {
//       type: 'PUBLIC';
//       cid: `ipfs://${string}`;
//       editor: `0x${string}`;
//     }
//   | { type: 'PERSONAL'; editor: `0x${string}` };

// function getCalldataForSpaceType(args: GovernanceTypeCalldataArgs): `0x${string}` {
//   switch (args.type) {
//     case 'PUBLIC':
//       return encodeFunctionData({
//         functionName: 'proposeAddEditor',
//         abi: MainVotingAbi,
//         // @TODO: Function for encoding args
//         args: [stringToHex(args.cid), args.editor],
//       });
//     case 'PERSONAL':
//       return encodeFunctionData({
//         functionName: 'submitNewEditor',
//         abi: PersonalSpaceAdminAbi,
//         // @TODO: Function for encoding args
//         args: [args.editor],
//       });
//   }
// }
