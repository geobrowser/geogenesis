'use client';

import { MemberAccessAbi } from '@geogenesis/sdk/abis';
import { encodeFunctionData } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { SmallButton } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  membershipContractAddress: string | null;
}

export function AcceptOrRejectMember(props: Props) {
  const smartAccount = useSmartAccount();

  const onApprove = async () => {
    if (!props.membershipContractAddress || !smartAccount) return;

    const hash = await smartAccount.sendTransaction({
      to: props.membershipContractAddress as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: MemberAccessAbi,
        functionName: 'approve',
        args: [BigInt(props.onchainProposalId)],
      }),
    });

    console.log('transaction successful', hash);
  };

  const onReject = async () => {
    if (!props.membershipContractAddress || !smartAccount) return;

    const hash = await smartAccount.sendTransaction({
      to: props.membershipContractAddress as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: MemberAccessAbi,
        functionName: 'reject',
        args: [BigInt(props.onchainProposalId)],
      }),
    });

    console.log('transaction successful', hash);
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
