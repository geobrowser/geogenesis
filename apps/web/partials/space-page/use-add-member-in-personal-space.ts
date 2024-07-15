'use client';

import { PersonalSpaceAdminAbi } from '@geogenesis/sdk/abis';
import { Effect } from 'effect';
import { encodeFunctionData } from 'viem';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

export function useAddMemberInPersonalSpace(pluginAddress: string | null) {
  const smartAccount = useSmartAccount();

  const write = async (editorToAdd: string) => {
    if (!pluginAddress || !smartAccount) {
      return;
    }

    // @TODO: Verify the editor is an actual address

    console.log('editor to add', editorToAdd);

    const writeTxEffect = Effect.gen(function* () {
      // We don't need offchain data for personal space membership actions as
      // there are no proposals created for them. We really only need offchain
      // data to disambiguate between the proposal types in the substream.
      const callData = encodeFunctionData({
        functionName: 'submitNewMember',
        abi: PersonalSpaceAdminAbi,
        args: [editorToAdd as `0x${string}`],
      });

      console.log('callData', callData);

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
    addMember: write,
  };
}
