'use client';

import { MemberAccessAbi } from '@geobrowser/gdk/abis';
import { Effect, Either } from 'effect';
import { encodeFunctionData } from 'viem';

import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';

import { SmallButton } from '~/design-system/button';

function useApproveOrReject(membershipContractAddress: string | null) {
  const tx = useSmartAccountTransaction({
    address: membershipContractAddress,
  });

  const approveOrReject = async (calldata: `0x${string}`) => {
    const txEffect = await tx(calldata);
    const maybeHash = await Effect.runPromise(Effect.either(txEffect));

    if (Either.isLeft(maybeHash)) {
      console.error('Could not approve or reject', maybeHash.left);
      return;
    }

    // @TODO: UI states/error states
    console.log('Approve or reject successful!', maybeHash.right);
    return maybeHash.right;
  };

  return approveOrReject;
}

interface Props {
  onchainProposalId: string;
  membershipContractAddress: string | null;
}

export function AcceptOrRejectMember(props: Props) {
  const approveOrReject = useApproveOrReject(props.membershipContractAddress);

  const onApprove = async () => {
    const hash = await approveOrReject(
      encodeFunctionData({
        abi: MemberAccessAbi,
        functionName: 'approve',
        args: [BigInt(props.onchainProposalId)],
      })
    );

    console.log('transaction successful', hash);
  };

  const onReject = async () => {
    const hash = await approveOrReject(
      encodeFunctionData({
        abi: MemberAccessAbi,
        functionName: 'reject',
        args: [BigInt(props.onchainProposalId)],
      })
    );

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
