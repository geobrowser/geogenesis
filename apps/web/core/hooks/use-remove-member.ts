'use client';

import { MainVotingAbi, PersonalSpaceAdminAbi } from '@geogenesis/sdk/abis';
import { createMembershipProposal } from '@geogenesis/sdk/proto';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { encodeFunctionData, getAddress, stringToHex } from 'viem';

import { TransactionWriteFailedError } from '~/core/errors';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { uploadBinary } from '~/core/io/storage/storage';
import { Services } from '~/core/services';
import { SpaceGovernanceType } from '~/core/types';

interface RemoveEditorArgs {
  votingPluginAddress: string | null;
  spaceType: SpaceGovernanceType;
}

export function useRemoveMember(args: RemoveEditorArgs) {
  const smartAccount = useSmartAccount();
  const { storageClient } = Services.useServices();

  const tx = useSmartAccountTransaction({
    address: args.votingPluginAddress,
  });

  const { mutate, status } = useMutation({
    mutationFn: async (memberToRemove: string) => {
      if (!args.votingPluginAddress || !smartAccount) {
        return;
      }

      const writeTxEffect = Effect.gen(function* () {
        if (args.spaceType === 'PUBLIC') {
          const membershipProposalMetadata = createMembershipProposal({
            name: 'Remove member request',
            type: 'REMOVE_MEMBER',
            userAddress: getAddress(memberToRemove) as `0x${string}`,
          });

          const cid = yield* uploadBinary(membershipProposalMetadata, storageClient);

          const callData = getCalldataForGovernanceType({
            type: args.spaceType,
            cid,
            memberAddress: getAddress(memberToRemove) as `0x${string}`,
          });

          return yield* tx(callData);
        }

        if (args.spaceType === 'PERSONAL') {
          const callData = getCalldataForGovernanceType({
            type: args.spaceType,
            memberAddress: getAddress(memberToRemove) as `0x${string}`,
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
        // @TODO: Function for encoding
        args: [stringToHex(args.cid), args.memberAddress as `0x${string}`],
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
