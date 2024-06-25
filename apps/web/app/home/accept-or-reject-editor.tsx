'use client';

import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi, MemberAccessAbi } from '@geogenesis/sdk/abis';
import { encodeFunctionData } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { SmallButton } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  votingContractAddress: string | null;
}

export function AcceptOrRejectEditor(props: Props) {
  const smartAccount = useSmartAccount();

  const onApprove = async () => {
    if (!props.votingContractAddress || !smartAccount) return;

    await smartAccount.sendTransaction({
      to: props.votingContractAddress as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: MainVotingAbi,
        functionName: 'vote',
        args: [BigInt(props.onchainProposalId), VoteOption.Yes, true],
      }),
    });
  };

  const onReject = async () => {
    if (!props.votingContractAddress || !smartAccount) return;

    await smartAccount.sendTransaction({
      to: props.votingContractAddress as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: MainVotingAbi,
        functionName: 'vote',
        args: [BigInt(props.onchainProposalId), VoteOption.Yes, false],
      }),
    });
  };

  return (
    <div className="flex items-center gap-2">
      <SmallButton variant="secondary" onClick={onReject}>
        Reject
      </SmallButton>
      <SmallButton variant="secondary" onClick={onApprove}>
        Approve
      </SmallButton>
    </div>
  );
}
