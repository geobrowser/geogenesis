'use client';

import { MainVotingAbi, PersonalSpaceAdminAbi } from '@geogenesis/sdk/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { encodeFunctionData, getAddress } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { SpaceGovernanceType } from '~/core/types';

interface RemoveEditorArgs {
  votingPluginAddress: string | null;
  spaceType: SpaceGovernanceType;
}

export function useRemoveEditor(args: RemoveEditorArgs) {
  const { smartAccount } = useSmartAccount();
  const tx = useSmartAccountTransaction({
    address: args.votingPluginAddress,
  });

  const { mutate, status } = useMutation({
    mutationFn: async (editorToRemove: string) => {
      if (!args.votingPluginAddress || !smartAccount) {
        return;
      }

      const writeTxEffect = Effect.gen(function* () {
        const callData = getCalldataForGovernanceType({
          type: args.spaceType,
          editorAddress: getAddress(editorToRemove) as `0x${string}`,
        });

        const hash = yield* tx(callData);
        console.log('Transaction hash: ', hash);
        return hash;
      });

      const res = await Effect.runPromise(Effect.either(writeTxEffect));
      Either.match(res, {
        onLeft: error => {
          console.error(error);
          throw error;
        },
        onRight: () => console.log('Successfully removed editor'),
      });
    },
  });

  return {
    removeEditor: mutate,
    status,
  };
}

type CalldataForGovernanceTypeArgs =
  | {
      type: 'PUBLIC';
      editorAddress: string;
    }
  | {
      type: 'PERSONAL';
      editorAddress: string;
    };

function getCalldataForGovernanceType(args: CalldataForGovernanceTypeArgs): `0x${string}` {
  switch (args.type) {
    case 'PUBLIC':
      return encodeFunctionData({
        functionName: 'proposeRemoveEditor',
        abi: MainVotingAbi,
        args: ['0x', args.editorAddress as `0x${string}`],
      });
    case 'PERSONAL':
      return encodeFunctionData({
        functionName: 'submitRemoveEditor',
        abi: PersonalSpaceAdminAbi,
        // @TODO: Function for encoding
        args: [args.editorAddress as `0x${string}`],
      });
  }
}
