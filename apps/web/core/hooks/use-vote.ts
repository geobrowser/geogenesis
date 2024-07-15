import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { Effect, Either } from 'effect';
import { encodeFunctionData } from 'viem';

import { Vote } from '../types';
import { useSmartAccountTransaction } from './use-smart-account-transaction';

interface Args {
  address: string;
  onchainProposalId: string;
}

export function useVote({ address, onchainProposalId }: Args) {
  const tx = useSmartAccountTransaction({
    address,
  });

  const vote = async (option: Vote['vote']) => {
    const txEffect = await tx(
      encodeFunctionData({
        abi: MainVotingAbi,
        functionName: 'vote',
        args: [BigInt(onchainProposalId), option === 'ACCEPT' ? VoteOption.Yes : VoteOption.No, true],
      })
    );

    const maybeHash = await Effect.runPromise(Effect.either(txEffect));

    if (Either.isLeft(maybeHash)) {
      return;
    }

    // @TODO: UI states/error states
    console.log('Vote successful!', maybeHash.right);
  };

  return vote;
}
