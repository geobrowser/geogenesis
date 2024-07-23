'use client';

import { MainVotingAbi, PersonalSpaceAdminAbi } from '@geogenesis/sdk/abis';
import { createSubspaceProposal } from '@geogenesis/sdk/proto';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { uploadBinary } from '~/core/io/storage/storage';
import { fetchSpace } from '~/core/io/subgraph';
import { Services } from '~/core/services';

interface RemoveSubspaceArgs {
  spaceId: string;
}

export function useRemoveSubspace(args: RemoveSubspaceArgs) {
  const { storageClient } = Services.useServices();

  // @TODO(performance): We can pass the space down from the layout as well to avoid
  // fetching on the client here.
  const { data: space } = useQuery({
    queryKey: ['fetch-space', args.spaceId],
    queryFn: () => fetchSpace({ id: args.spaceId }),
  });

  const tx = useSmartAccountTransaction({
    address:
      space?.type === 'PERSONAL' ? space?.personalSpaceAdminPluginAddress : space?.mainVotingPluginAddress ?? null,
  });

  const { mutate, isPending, isSuccess } = useMutation({
    mutationFn: async (subspaceAddress: string) => {
      if (!space) {
        return null;
      }

      const proposal = createSubspaceProposal({
        name: 'Remove subspace',
        type: 'REMOVE_SUBSPACE',
        spaceAddress: subspaceAddress as `0x${string}`, // Some governance space
      });

      const writeTxEffect = Effect.gen(function* () {
        if (space.type === 'PUBLIC') {
          const proposal = createSubspaceProposal({
            name: 'Remove subspace',
            type: 'REMOVE_SUBSPACE',
            spaceAddress: subspaceAddress as `0x${string}`, // Some governance space
          });

          const cid = yield* uploadBinary(proposal, storageClient);

          const calldata = getCalldataForGovernanceType({
            type: space.type,
            spacePluginAddress: space.spacePluginAddress,
            subspaceAddress,
            cid,
          });

          return yield* tx(calldata);
        }

        if (space.type === 'PERSONAL') {
          const calldata = getCalldataForGovernanceType({
            type: space.type,
            spacePluginAddress: space.spacePluginAddress,
            subspaceAddress,
          });

          return yield* tx(calldata);
        }

        throw new Error('Invalid governance type found when writing subspace proposal', space.type);
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
    removeSubspace: mutate,
    isPending,
    isSuccess,
  };
}

type CalldataForGovernanceTypeArgs =
  | {
      type: 'PUBLIC';
      cid: `ipfs://${string}`;
      subspaceAddress: string;
      spacePluginAddress: string;
    }
  | {
      type: 'PERSONAL';
      subspaceAddress: string;
      spacePluginAddress: string;
    };

function getCalldataForGovernanceType(args: CalldataForGovernanceTypeArgs): `0x${string}` {
  switch (args.type) {
    case 'PUBLIC':
      return encodeFunctionData({
        functionName: 'proposeRemoveSubspace',
        abi: MainVotingAbi,
        args: [stringToHex(args.cid), args.subspaceAddress as `0x${string}`, args.spacePluginAddress as `0x${string}`],
      });
    case 'PERSONAL':
      return encodeFunctionData({
        functionName: 'submitRemoveSubspace',
        abi: PersonalSpaceAdminAbi,
        args: [args.subspaceAddress as `0x${string}`, args.spacePluginAddress as `0x${string}`],
      });
  }
}
