'use client';

import { MainVotingAbi, PersonalSpaceAdminAbi } from '@geobrowser/gdk/abis';
import { createMembershipProposal } from '@geobrowser/gdk/proto';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { encodeFunctionData, getAddress, stringToHex } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { SpaceGovernanceType } from '~/core/types';

import { IpfsEffectClient } from '../io/ipfs-client';

interface RemoveEditorArgs {
  votingPluginAddress: string | null;
  spaceType: SpaceGovernanceType;
}

export function useRemoveEditor(args: RemoveEditorArgs) {
  const smartAccount = useSmartAccount();

  const tx = useSmartAccountTransaction({
    address: args.votingPluginAddress,
  });

  const { mutate, status } = useMutation({
    mutationFn: async (editorToRemove: string) => {
      if (!args.votingPluginAddress || !smartAccount) {
        return;
      }

      const writeTxEffect = Effect.gen(function* () {
        if (args.spaceType === 'PUBLIC') {
          const membershipProposalMetadata = createMembershipProposal({
            name: 'Remove editor request',
            type: 'REMOVE_EDITOR',
            userAddress: getAddress(editorToRemove) as `0x${string}`,
          });

          const cid = yield* IpfsEffectClient.upload(membershipProposalMetadata);

          const callData = getCalldataForGovernanceType({
            type: args.spaceType,
            cid,
            editorAddress: getAddress(editorToRemove) as `0x${string}`,
          });

          return yield* tx(callData);
        }

        if (args.spaceType === 'PERSONAL') {
          const callData = getCalldataForGovernanceType({
            type: args.spaceType,
            editorAddress: getAddress(editorToRemove) as `0x${string}`,
          });

          return yield* tx(callData);
        }
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
      cid: `ipfs://${string}`;
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
        // @TODO: Function for encoding
        args: [stringToHex(args.cid), args.editorAddress as `0x${string}`],
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
