'use client';

import { MainVotingAbi, PersonalSpaceAdminAbi } from '@geobrowser/gdk/abis';
import { createSubspaceProposal } from '@geobrowser/gdk/proto';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useRouter } from 'next/navigation';
import { encodeFunctionData, stringToHex } from 'viem';

import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { fetchSpace } from '~/core/io/subgraph';

import { IpfsEffectClient } from '../io/ipfs-client';

interface AddSubspaceArgs {
  spaceId: string;
  shouldRefreshOnSuccess?: boolean;
}

export function useAddSubspace(args: AddSubspaceArgs) {
  const router = useRouter();

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
    },
    mutationFn: async (subspaceAddress: string) => {
      if (!space) {
        return null;
      }

      const writeTxEffect = Effect.gen(function* () {
        if (space.type === 'PUBLIC') {
          const proposal = createSubspaceProposal({
            name: 'Add subspace',
            type: 'ADD_SUBSPACE',
            spaceAddress: subspaceAddress as `0x${string}`, // Some governance space
          });

          const cid = yield* IpfsEffectClient.upload(proposal);

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
    addSubspace: mutate,
    status,
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
        functionName: 'proposeAcceptSubspace',
        abi: MainVotingAbi,
        // @TODO: Function for encoding
        args: [stringToHex(args.cid), args.subspaceAddress as `0x${string}`, args.spacePluginAddress as `0x${string}`],
      });
    case 'PERSONAL':
      return encodeFunctionData({
        functionName: 'submitAcceptSubspace',
        abi: PersonalSpaceAdminAbi,
        // @TODO: Function for encoding
        args: [args.subspaceAddress as `0x${string}`, args.spacePluginAddress as `0x${string}`],
      });
  }
}
