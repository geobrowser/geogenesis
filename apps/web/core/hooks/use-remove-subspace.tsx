'use client';

import { MainVotingAbi, PersonalSpaceAdminAbi } from '@geoprotocol/geo-sdk/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useRouter } from 'next/navigation';
import { encodeFunctionData } from 'viem';

import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';

import { useSpace } from './use-space';

interface RemoveSubspaceArgs {
  spaceId: string;
  shouldRefreshOnSuccess?: boolean;
}

export function useRemoveSubspace(args: RemoveSubspaceArgs) {
  const router = useRouter();

  // @TODO(performance): We can pass the space down from the layout as well to avoid
  // fetching on the client here.
  const { space } = useSpace(args.spaceId);

  const tx = useSmartAccountTransaction({
    address: space?.address ?? null,
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
        const calldata = getCalldataForGovernanceType({
          type: space.type,
          spacePluginAddress: space.address,
          subspaceAddress,
        });

        const hash = yield* tx(calldata);
        console.log('Transaction hash: ', hash);
        return hash;
      });

      await Effect.runPromise(writeTxEffect);
    },
  });

  return {
    removeSubspace: mutate,
    status,
  };
}

type CalldataForGovernanceTypeArgs =
  | {
      type: 'DAO';
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
    case 'DAO':
      return encodeFunctionData({
        functionName: 'proposeRemoveSubspace',
        abi: MainVotingAbi,
        args: ['0x', args.subspaceAddress as `0x${string}`, args.spacePluginAddress as `0x${string}`],
      });
    case 'PERSONAL':
      return encodeFunctionData({
        functionName: 'submitRemoveSubspace',
        abi: PersonalSpaceAdminAbi,
        args: [args.subspaceAddress as `0x${string}`, args.spacePluginAddress as `0x${string}`],
      });
  }
}
