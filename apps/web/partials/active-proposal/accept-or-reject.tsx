'use client';

import * as React from 'react';
import { useState } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useVote } from '~/core/hooks/use-vote';
import { Proposal } from '~/core/io/dto/proposals';
import { SubstreamVote } from '~/core/io/substream-schema';

import { Button } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

import { Execute } from './execute';

interface Props {
  spaceId: string;
  isProposalEnded: boolean;
  // If the proposal is executable that means it's done and the
  // acceptance threshold has passed.
  isProposalExecutable: boolean;
  status: Proposal['status'];

  userVote: SubstreamVote | undefined;
  proposalId: string;
}

export function AcceptOrReject({
  spaceId,
  isProposalEnded,
  isProposalExecutable,
  status,
  userVote,
  proposalId,
}: Props) {
  const { isEditor } = useAccessControl(spaceId);
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

  if (isProposalExecutable && smartAccount) {
    return (
      <Execute spaceId={spaceId} proposalId={proposalId}>
        Execute
      </Execute>
    );
  }

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

    return <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">Rejected</div>;
  }

  if (!isProposalEnded && smartAccount && isEditor) {
    return (
      <div className="relative">
        <div className="inline-flex items-center gap-4">
          <Button onClick={onReject} variant="error" disabled={voteStatus !== 'idle'}>
            <Pending isPending={isPendingRejection}>Reject</Pending>
          </Button>
          <span>or</span>
          <Button onClick={onApprove} variant="success" disabled={voteStatus !== 'idle'}>
            <Pending isPending={isPendingApproval}>Accept</Pending>
          </Button>
        </div>
      </div>
    );
  }

  // Janky placeholder for button height
  return <div className="h-9 w-1" />;
}
