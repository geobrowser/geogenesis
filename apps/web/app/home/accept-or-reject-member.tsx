'use client';

import { MemberAccessAbi } from '@geogenesis/sdk/abis';

import { useConfig } from 'wagmi';
import { simulateContract, writeContract } from 'wagmi/actions';

import { SmallButton } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  membershipContractAddress: string | null;
}

export function AcceptOrRejectMember(props: Props) {
  const walletConfig = useConfig();

  const onApprove = async () => {
    if (!props.membershipContractAddress) return;

    const config = await simulateContract(walletConfig, {
      address: props.membershipContractAddress as `0x${string}`,
      abi: MemberAccessAbi,
      functionName: 'approve',
      args: [BigInt(props.onchainProposalId)],
    });

    const writeResult = await writeContract(walletConfig, config.request);
    console.log('approval transaction', writeResult);
  };

  const onReject = async () => {
    if (!props.membershipContractAddress) return;

    const config = await simulateContract(walletConfig, {
      address: props.membershipContractAddress as `0x${string}`,
      abi: MemberAccessAbi,
      functionName: 'reject',
      args: [BigInt(props.onchainProposalId)],
    });

    const writeResult = await writeContract(walletConfig, config.request);
    console.log('rejection transaction', writeResult);
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
