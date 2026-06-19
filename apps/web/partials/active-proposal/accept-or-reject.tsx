'use client';

import * as React from 'react';
import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useToast } from '~/core/hooks/use-toast';
import { getStaleProposalVoteToastMessage, useVote } from '~/core/hooks/use-vote';
import { Proposal } from '~/core/io/dto/proposals';
import { SubstreamVote } from '~/core/io/substream-schema';
import { useReportError } from '~/core/state/status-bar-store';
import { describeGovernanceError } from '~/core/utils/contracts/governance-errors';

import { Button } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

import { GovernanceReopenEditButton } from '~/partials/governance/governance-reopen-edit-button';
import { useAddOptimisticVote, useRemoveOptimisticVote } from '~/partials/governance/optimistic-voted-atom';

import { Execute } from './execute';
import { useCloseProposal } from './use-close-proposal';

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
  const router = useRouter();
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
  const addOptimisticVote = useAddOptimisticVote();
  const removeOptimisticVote = useRemoveOptimisticVote();
  const reportError = useReportError();
  const [, setToast] = useToast();
  const closeProposal = useCloseProposal(spaceId);

  // Once the server-rendered userVote catches up after router.refresh, the
  // optimistic entry has done its job — drop it so the atom doesn't grow
  // across a session and the artificial CSS order bump stops applying.
  React.useEffect(() => {
    if (userVote) {
      removeOptimisticVote(proposalId);
    }
  }, [userVote, proposalId, removeOptimisticVote]);

  const onVoteSuccess = () => {
    router.refresh();
  };

  const onVoteError = (choice: 'ACCEPT' | 'REJECT') => (error: unknown) => {
    removeOptimisticVote(proposalId);
    // A stale proposal can't be voted through — retrying would revert again,
    // so close the review window and toast instead of raising the error modal.
    const staleMessage = getStaleProposalVoteToastMessage(error, proposalType);
    if (staleMessage) {
      setToast(<span>{staleMessage}</span>);
      closeProposal();
      router.refresh();
      return;
    }
    const message = describeGovernanceError(error);
    reportError(`Vote failed: ${message}`, () => {
      addOptimisticVote(proposalId);
      vote(choice, { onSuccess: onVoteSuccess, onError: onVoteError(choice) });
    });
  };

  const onApprove = () => {
    setHasApproved(true);
    addOptimisticVote(proposalId);
    vote('ACCEPT', { onSuccess: onVoteSuccess, onError: onVoteError('ACCEPT') });
  };

  const onReject = () => {
    setHasRejected(true);
    addOptimisticVote(proposalId);
    vote('REJECT', { onSuccess: onVoteSuccess, onError: onVoteError('REJECT') });
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
      return <Execute spaceId={spaceId} proposalId={proposalId} proposalType={proposalType} variant="small" />;
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
        <Button onClick={onReject} variant="error" small disabled={voteStatus === 'pending'}>
          <Pending isPending={isPendingRejection}>Reject</Pending>
        </Button>
        <Button onClick={onApprove} variant="success" small disabled={voteStatus === 'pending'}>
          <Pending isPending={isPendingApproval}>Accept</Pending>
        </Button>
      </div>
    );
  }

  return null;
}
