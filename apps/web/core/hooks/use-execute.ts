import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { Effect, Either } from 'effect';
import { encodeFunctionData } from 'viem';

import { useSmartAccountTransaction } from './use-smart-account-transaction';

interface Args {
  address: string;
  onchainProposalId: string;
}

export function useExecute({ address, onchainProposalId }: Args) {
  const tx = useSmartAccountTransaction({
    address,
  });

  const execute = async () => {
    console.log('error', error);

    const txEffect = await tx(
      encodeFunctionData({
        abi: MainVotingAbi,
        functionName: 'execute',
        args: [BigInt(onchainProposalId)],
      })
    );

    const maybeHash = await Effect.runPromise(Effect.either(txEffect));

    if (Either.isLeft(maybeHash)) {
      console.error('Error executing', maybeHash.left);
      return;
    }

    // @TODO: UI states/error states
    console.log('Execute successful!', maybeHash.right);
  };

  return execute;
}
