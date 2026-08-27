'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useToast } from '~/core/hooks/use-toast';
import { getStaleProposalVoteToastMessage, useVote } from '~/core/hooks/use-vote';
import { Proposal } from '~/core/io/dto/proposals';
import { SubstreamVote } from '~/core/io/substream-schema';
import { useReportError } from '~/core/state/status-bar-store';
import { describeGovernanceError } from '~/core/utils/contracts/governance-errors';

import { SmallButton } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';
import { Pending } from '~/design-system/pending';

import { Execute } from '~/partials/active-proposal/execute';
import { useAddOptimisticVote, useRemoveOptimisticVote } from '~/partials/governance/optimistic-voted-atom';

interface Props {
  spaceId: string;
  isProposalEnded: boolean;
  canExecute: boolean;
  status: Proposal['status'];
  proposalType: Proposal['type'];

  userVote: SubstreamVote | undefined;
  proposalId: string;
  proposalVersion?: number;
}

export function AcceptOrRejectEditor({
  spaceId,
  isProposalEnded,
  canExecute,
  status,
  proposalType,
  userVote,
  proposalId,
  proposalVersion,
}: Props) {
  const router = useRouter();

  const { vote, status: voteStatus } = useVote({
    spaceId,
    proposalId,
    proposalVersion,
  });

  const [pendingChoice, setPendingChoice] = useState<'ACCEPT' | 'REJECT' | null>(null);

  const { smartAccount } = useSmartAccount();
  const addOptimisticVote = useAddOptimisticVote();
  const removeOptimisticVote = useRemoveOptimisticVote();
  const reportError = useReportError();
  const [, setToast] = useToast();

  const isPending = voteStatus === 'pending';
  const txSucceeded = voteStatus === 'success';
  // The viewer's effective vote: a just-succeeded local choice wins over the
  // server view, which after a vote *change* still carries the old vote until
  // the indexer catches up — letting it win would snap the UI back to the old
  // choice and allow a duplicate replacement tx. The server view (survives
  // refresh) applies when nothing succeeded locally. Held `undefined` while a
  // tx is in-flight so the buttons stay interactive with an in-button spinner.
  const currentVote: 'ACCEPT' | 'REJECT' | 'ABSTAIN' | undefined =
    (txSucceeded && pendingChoice ? pendingChoice : undefined) ?? userVote?.vote;

  // Retire the local override the moment the server agrees with it. Without
  // this the override is permanent (nothing else clears pendingChoice on the
  // success path), so a LATER change made elsewhere — another tab, the proposal
  // modal — stays masked forever: the card shows the superseded vote and
  // submitVote's no-op guard renders the correct button inert, unrecoverable
  // without a reload. Clearing here keeps local precedence for exactly the
  // window it's needed: after our tx, until the indexer catches up.
  useEffect(() => {
    if (pendingChoice && userVote?.vote === pendingChoice) {
      setPendingChoice(null);
    }
  }, [pendingChoice, userVote?.vote]);

  // Drop the optimistic entry once router.refresh has caught up and userVote
  // is reflected on the prop — server render now naturally places the card
  // at the bottom of its bucket without our artificial order bump.
  useEffect(() => {
    if (userVote) {
      removeOptimisticVote(proposalId);
    }
  }, [userVote, proposalId, removeOptimisticVote]);

  const onVoteSuccess = () => {
    router.refresh();
  };

  const onVoteError = (choice: 'ACCEPT' | 'REJECT', isChange: boolean) => (error: unknown) => {
    setPendingChoice(null);
    removeOptimisticVote(proposalId);
    // A stale proposal can't be voted through — retrying would revert again, so
    // toast + refresh instead of the error modal. On a *change*, the message
    // says the original vote stands (degraded path for a DAO that doesn't allow
    // vote replacement) rather than implying the vote was lost.
    const staleMessage = getStaleProposalVoteToastMessage(error, proposalType, { isVoteChange: isChange });
    if (staleMessage) {
      setToast(<span>{staleMessage}</span>);
      router.refresh();
      return;
    }
    const message = describeGovernanceError(error);
    reportError(`Vote failed: ${message}`, () => {
      setPendingChoice(choice);
      addOptimisticVote(proposalId, choice);
      vote(choice, { onSuccess: onVoteSuccess, onError: onVoteError(choice, isChange) });
    });
  };

  // Cast — or change — the vote. Clicking the side you already picked is a
  // no-op (it would just spend a transaction re-affirming the same choice).
  const submitVote = (choice: 'ACCEPT' | 'REJECT') => {
    if (currentVote === choice) return;
    const isChange = currentVote != null && currentVote !== choice;
    setPendingChoice(choice);
    addOptimisticVote(proposalId);
    vote(choice, { onSuccess: onVoteSuccess, onError: onVoteError(choice, isChange) });
  };

  const onApprove = () => submitVote('ACCEPT');
  const onReject = () => submitVote('REJECT');

  // Terminal / post-vote states on the proposal must win over "You accepted" so we match space
  // governance (e.g. passed vote awaiting on-chain execution → "Pending execution").
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

  // While the proposal is open, editors can vote and change their vote. The
  // current choice is shown checked + emphasized and is inert; the other side
  // submits a replacement vote.
  if (!isProposalEnded && smartAccount) {
    const accepted = currentVote === 'ACCEPT';
    const rejected = currentVote === 'REJECT';
    return (
      <div className="flex items-center gap-2">
        <SmallButton
          variant="secondary"
          onClick={onReject}
          disabled={isPending}
          icon={rejected ? <Check /> : undefined}
          className={rejected ? 'cursor-default border-text! bg-bg!' : undefined}
          aria-pressed={rejected}
        >
          <Pending isPending={isPending && pendingChoice === 'REJECT'}>{rejected ? 'Rejected' : 'Reject'}</Pending>
        </SmallButton>
        <SmallButton
          variant="secondary"
          onClick={onApprove}
          disabled={isPending}
          icon={accepted ? <Check /> : undefined}
          className={accepted ? 'cursor-default border-text! bg-bg!' : undefined}
          aria-pressed={accepted}
        >
          <Pending isPending={isPending && pendingChoice === 'ACCEPT'}>{accepted ? 'Approved' : 'Approve'}</Pending>
        </SmallButton>
      </div>
    );
  }

  // Not connected (or no smart account) but the viewer has a recorded vote —
  // surface it read-only.
  if (currentVote === 'ACCEPT') {
    return <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">You accepted</div>;
  }
  if (currentVote === 'REJECT') {
    return <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">You rejected</div>;
  }

  return null;
}
