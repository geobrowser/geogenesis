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
import { GovernanceReopenEditButton } from '~/partials/governance/governance-reopen-edit-button';

import { Execute } from './execute';

interface Props {
  spaceId: string;
  isProposalEnded: boolean;
  status: Proposal['status'];
  canExecute: boolean;
  proposalType: Proposal['type'];

  userVote: SubstreamVote | undefined;
  proposalId: string;
}

export function AcceptOrReject({
  spaceId,
  isProposalEnded,
  status,
  canExecute,
  proposalType,
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

  if (isProposalEnded) {
    if (status === 'ACCEPTED') {
      return (
        <div className="inline-flex h-6 items-center rounded bg-successTertiary px-1.5 text-metadata leading-none text-green">
          Accepted
        </div>
      );
    }

    if (status === 'REJECTED') {
      const rejectedBadge = (
        <div className="inline-flex h-6 items-center rounded bg-errorTertiary px-1.5 text-metadata leading-none text-red-01">
          Rejected
        </div>
      );
      if (proposalType === 'ADD_EDIT') {
        return (
          <div className="inline-flex items-center gap-2">
            <GovernanceReopenEditButton proposalId={proposalId} spaceId={spaceId} />
            {rejectedBadge}
          </div>
        );
      }
      return rejectedBadge;
    }

    if (canExecute && smartAccount) {
      return <Execute spaceId={spaceId} proposalId={proposalId} variant="small" />;
    }

    if (canExecute) {
      return (
        <div className="inline-flex h-6 items-center rounded bg-successTertiary px-1.5 text-metadata leading-none text-green">
          Pending execution
        </div>
      );
    }

    return (
      <div className="inline-flex h-6 items-center rounded bg-errorTertiary px-1.5 text-metadata leading-none text-red-01">
        Rejected
      </div>
    );
  }

  if (userVote || hasVoted) {
    if (userVote?.vote === 'ACCEPT' || hasApproved) {
      return (
        <div className="inline-flex h-6 items-center rounded bg-successTertiary px-1.5 text-metadata leading-none text-green">
          You accepted
        </div>
      );
    }

    return (
      <div className="inline-flex h-6 items-center rounded bg-errorTertiary px-1.5 text-metadata leading-none text-red-01">
        You rejected
      </div>
    );
  }

  if (!isProposalEnded && smartAccount && isEditor) {
    return (
      <div className="inline-flex items-center gap-2">
        <Button onClick={onReject} variant="error" small disabled={voteStatus !== 'idle'}>
          <Pending isPending={isPendingRejection}>Reject</Pending>
        </Button>
        <Button onClick={onApprove} variant="success" small disabled={voteStatus !== 'idle'}>
          <Pending isPending={isPendingApproval}>Accept</Pending>
        </Button>
      </div>
    );
  }

  return null;
}
