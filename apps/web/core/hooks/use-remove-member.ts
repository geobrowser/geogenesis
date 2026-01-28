'use client';

import { MainVotingAbi, PersonalSpaceAdminAbi } from '@geoprotocol/geo-sdk/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { encodeFunctionData, getAddress } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { SpaceGovernanceType } from '~/core/types';

interface RemoveEditorArgs {
  votingPluginAddress: string | null;
  spaceType: SpaceGovernanceType;
}

export function useRemoveMember(args: RemoveEditorArgs) {
  const { smartAccount } = useSmartAccount();
  const tx = useSmartAccountTransaction({
    address: args.votingPluginAddress,
  });

  const { mutate, status } = useMutation({
    mutationFn: async (memberToRemove: string) => {
      if (!args.votingPluginAddress || !smartAccount) {
        return;
      }

      const writeTxEffect = Effect.gen(function* () {
        const callData = getCalldataForGovernanceType({
          type: args.spaceType,
          memberAddress: getAddress(memberToRemove) as `0x${string}`,
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
    removeEditor: mutate,
    status,
  };
}

type CalldataForGovernanceTypeArgs =
  | {
      type: 'PUBLIC';
      memberAddress: string;
    }
  | {
      type: 'PERSONAL';
      memberAddress: string;
    };

function getCalldataForGovernanceType(args: CalldataForGovernanceTypeArgs): `0x${string}` {
  switch (args.type) {
    case 'PUBLIC':
      return encodeFunctionData({
        functionName: 'proposeRemoveMember',
        abi: MainVotingAbi,
        args: ['0x', args.memberAddress as `0x${string}`],
      });
    case 'PERSONAL':
      return encodeFunctionData({
        functionName: 'submitRemoveMember',
        abi: PersonalSpaceAdminAbi,
        // @TODO: Function for encoding
        args: [args.memberAddress as `0x${string}`],
      });
  }
}
