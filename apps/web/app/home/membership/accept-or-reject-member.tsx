'use client';

import { MemberAccessAbi } from '@geogenesis/sdk/abis';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { SmallButton } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  membershipContractAddress: string | null;
}

export function AcceptOrRejectMember(props: Props) {
  const { data: wallet } = useWalletClient();

  const onApprove = async () => {
    if (!wallet || !props.membershipContractAddress) return;

    const config = await prepareWriteContract({
      walletClient: wallet,
      address: props.membershipContractAddress as `0x${string}`,
      abi: MemberAccessAbi,
      functionName: 'approve',
      args: [BigInt(props.onchainProposalId)],
    });

    const writeResult = await writeContract(config);
    console.log('approval transaction', writeResult);
  };

  const onReject = async () => {
    if (!wallet || !props.membershipContractAddress) return;

    const config = await prepareWriteContract({
      walletClient: wallet,
      address: props.membershipContractAddress as `0x${string}`,
      abi: MemberAccessAbi,
      functionName: 'reject',
      args: [BigInt(props.onchainProposalId)],
    });

    const writeResult = await writeContract(config);
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
