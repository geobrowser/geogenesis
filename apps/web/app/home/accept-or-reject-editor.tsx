'use client';

import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';

import { useConfig } from 'wagmi';
import { simulateContract, writeContract } from 'wagmi/actions';

import { Vote } from '~/core/types';

import { SmallButton } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  votingContractAddress: string | null;
}

export function AcceptOrRejectEditor(props: Props) {
  const walletConfig = useConfig();

  const onClick = async (option: Vote['vote']) => {
    if (!props.votingContractAddress) return;

    const config = await simulateContract(walletConfig, {
      address: props.votingContractAddress as `0x${string}`,
      abi: MainVotingAbi,
      functionName: 'vote',
      args: [BigInt(props.onchainProposalId), option === 'ACCEPT' ? VoteOption.Yes : VoteOption.No, true],
    });

    const writeResult = await writeContract(walletConfig, config.request);
    console.log('writeResult', writeResult);
  };

  return (
    <div className="flex items-center gap-2">
      <SmallButton variant="secondary" onClick={() => onClick('REJECT')}>
        Reject
      </SmallButton>
      <SmallButton variant="secondary" onClick={() => onClick('ACCEPT')}>
        Approve
      </SmallButton>
    </div>
  );
}
