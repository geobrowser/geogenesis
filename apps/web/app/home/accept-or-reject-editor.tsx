'use client';

import { useState } from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useVote } from '~/core/hooks/use-vote';
import { Proposal } from '~/core/io/dto/proposals';
import { SubstreamVote } from '~/core/io/substream-schema';

import { SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

import { Execute } from '~/partials/active-proposal/execute';

interface Props {
  spaceId: string;
  isProposalEnded: boolean;
  canExecute: boolean;
  status: Proposal['status'];

  userVote: SubstreamVote | undefined;
  proposalId: string;
}

export function AcceptOrRejectEditor({ spaceId, isProposalEnded, canExecute, status, userVote, proposalId }: Props) {
  const { vote, status: voteStatus } = useVote({
    spaceId,
    proposalId,
  });

  const [hasApproved, setHasApproved] = useState<boolean>(false);
  const [hasRejected, setHasRejected] = useState<boolean>(false);

  const hasVoted = voteStatus === 'success';
  const isPendingApproval = hasApproved && voteStatus === 'pending';
  const isPendingRejection = hasRejected && voteStatus === 'pending';

  const { smartAccount } = useSmartAccount();

  const onApprove = () => {
    setHasApproved(true);
    vote('ACCEPT');
  };

  const onReject = () => {
    setHasRejected(true);
    vote('REJECT');
  };

  if (userVote || hasVoted) {
    if (userVote?.vote === 'ACCEPT' || hasApproved) {
      return <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">You accepted</div>;
    }

    return <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">You rejected</div>;
  }

  if (isProposalEnded) {
    if (status === 'ACCEPTED') {
      return <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">Accepted</div>;
    }

    if (status === 'REJECTED') {
      return <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">Rejected</div>;
    }

    if (canExecute && smartAccount) {
      return <Execute spaceId={spaceId} proposalId={proposalId} variant="small" />;
    }

    if (canExecute) {
      return <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">Pending execution</div>;
    }

    return <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">Rejected</div>;
  }

  if (!isProposalEnded && smartAccount) {
    return (
      <div className="relative">
        <div className="flex items-center gap-2">
          <SmallButton variant="secondary" onClick={onReject} disabled={voteStatus !== 'idle'}>
            <Pending isPending={isPendingRejection}>Reject</Pending>
          </SmallButton>
          <SmallButton variant="secondary" onClick={onApprove} disabled={voteStatus !== 'idle'}>
            <Pending isPending={isPendingApproval}>Approve</Pending>
          </SmallButton>
        </div>
      </div>
    );
  }

  return null;
}
