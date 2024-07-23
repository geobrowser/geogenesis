import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { encodeFunctionData } from 'viem';

import { useSmartAccountTransaction } from './use-smart-account-transaction';

interface Args {
  address: string;
  onchainProposalId: string;
}

export function useExecuteProposal({ address, onchainProposalId }: Args) {
  const tx = useSmartAccountTransaction({
    address,
  });

  const { mutate, status } = useMutation({
    mutationFn: async () => {
      const txEffect = await tx(
        encodeFunctionData({
          abi: MainVotingAbi,
          functionName: 'execute',
          args: [BigInt(onchainProposalId)],
        })
      );

      const hash = await Effect.runPromise(txEffect);
      console.log('Execute successful!', hash);
    },
  });

  return {
    execute: mutate,
    status,
  };
}
