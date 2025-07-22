'use client';

import { MemberAccessAbi } from '@graphprotocol/grc-20/abis';
import cx from 'classnames';
import { Effect, Either } from 'effect';
import { encodeFunctionData } from 'viem';

import { useState } from 'react';

import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';

import { SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

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
  const [isPendingApproval, setIsPendingApproval] = useState<boolean>(false);
  const [isPendingRejection, setIsPendingRejection] = useState<boolean>(false);
  const [hasVoted, setHasVoted] = useState<boolean>(false);

  const approveOrReject = useApproveOrReject(props.membershipContractAddress);

  const onApprove = async () => {
    try {
      setIsPendingApproval(true);
      const hash = await approveOrReject(
        encodeFunctionData({
          abi: MemberAccessAbi,
          functionName: 'approve',
          args: [BigInt(props.onchainProposalId)],
        })
      );
      console.log('transaction successful', hash);
      setHasVoted(true);
      setIsPendingApproval(false);
    } catch (error) {
      console.error(error);
      setHasVoted(false);
      setIsPendingApproval(false);
    }
  };

  const onReject = async () => {
    try {
      setIsPendingRejection(true);
      const hash = await approveOrReject(
        encodeFunctionData({
          abi: MemberAccessAbi,
          functionName: 'reject',
          args: [BigInt(props.onchainProposalId)],
        })
      );
      console.log('transaction successful', hash);
      setHasVoted(true);
      setIsPendingRejection(false);
    } catch (error) {
      console.error(error);
      setHasVoted(false);
      setIsPendingRejection(false);
    }
  };

  return (
    <div className="relative">
      <div className={cx('flex items-center gap-2', hasVoted && 'invisible')}>
        <SmallButton variant="secondary" onClick={onReject}>
          <Pending isPending={isPendingRejection}>Reject</Pending>
        </SmallButton>
        <SmallButton variant="secondary" onClick={onApprove}>
          <Pending isPending={isPendingApproval}>Approve</Pending>
        </SmallButton>
      </div>
      {hasVoted && (
        <div className="absolute inset-0 flex h-full w-full items-center justify-center">
          <div className="text-smallButton">Vote registered</div>
        </div>
      )}
    </div>
  );
}
