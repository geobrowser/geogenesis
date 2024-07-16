'use client';

import { PersonalSpaceAdminAbi } from '@geogenesis/sdk/abis';
import { Effect } from 'effect';
import { encodeFunctionData } from 'viem';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

export function useAddEditor(pluginAddress: string | null) {
  const smartAccount = useSmartAccount();

  const write = async (editorToAdd: string) => {
    if (!pluginAddress || !smartAccount) {
      return;
    }

    // @TODO: Verify the editor is an actual address

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
            to: pluginAddress as `0x${string}`,
            value: 0n,
            data: callData,
          }),
        catch: error =>
          new TransactionWriteFailedError(
            `Adding member in personal space with plugin address ${pluginAddress} failed: ${error}`
          ),
      });

      console.log('Transaction hash: ', hash);
      return hash;
    });

    await Effect.runPromise(writeTxEffect);
  };

  return {
    addEditor: write,
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
