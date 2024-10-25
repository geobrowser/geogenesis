import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { useMutation } from '@tanstack/react-query';
import { Effect } from 'effect';
import { encodeFunctionData } from 'viem';

import { SubstreamVote } from '../io/schema';
import { useSmartAccountTransaction } from './use-smart-account-transaction';

interface Args {
  address: string;
  onchainProposalId: string;
}

export function useVote({ address, onchainProposalId }: Args) {
  const tx = useSmartAccountTransaction({
    address,
  });

  const { mutate, status } = useMutation({
    mutationFn: async (option: SubstreamVote['vote']) => {
      const txEffect = tx(
        encodeFunctionData({
          abi: MainVotingAbi,
          functionName: 'vote',
          args: [BigInt(onchainProposalId), option === 'ACCEPT' ? VoteOption.Yes : VoteOption.No, true],
        })
      );

      const hash = await Effect.runPromise(txEffect);
      console.log('Vote successful!', hash);
    },
  });

  return {
    vote: mutate,
    status,
  };
}
