'use client';

import * as React from 'react';
import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useToast } from '~/core/hooks/use-toast';
import { getStaleProposalVoteToastMessage, useVote } from '~/core/hooks/use-vote';
import { Proposal, VoteWithProfile } from '~/core/io/dto/proposals';
import { useReportError } from '~/core/state/status-bar-store';
import { describeGovernanceError } from '~/core/utils/contracts/governance-errors';

import { Button } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

import { GovernanceReopenEditButton } from '~/partials/governance/governance-reopen-edit-button';
import {
  useAddOptimisticVote,
  useOptimisticVoteChoice,
  useRemoveOptimisticVote,
} from '~/partials/governance/optimistic-voted-atom';

import { Execute } from './execute';
import { useCloseProposal } from './use-close-proposal';

interface Props {
  spaceId: string;
  isProposalEnded: boolean;
  status: Proposal['status'];
  canExecute: boolean;
  proposalType: Proposal['type'];

  /** Full vote list from the server. Used to detect the connected user's own
   *  vote via personal-space ID (a vote's `accountId` is the voter's personal
   *  spaceId, NOT their wallet address — so we can't match on the cookie's
   *  wallet address). */
  votes: VoteWithProfile[];
  proposalId: string;
  proposalVersion?: number;
}

export function AcceptOrReject({
  spaceId,
  isProposalEnded,
  status,
  canExecute,
  proposalType,
  votes,
  proposalId,
  proposalVersion,
}: Props) {
  const router = useRouter();
  const { isEditor } = useAccessControl(spaceId);
  const { vote, status: voteStatus } = useVote({
    spaceId,
    proposalId,
    proposalVersion,
  });

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isLoading: isPersonalSpaceIdLoading } = usePersonalSpaceId();
  const addOptimisticVote = useAddOptimisticVote();
  const optimisticVote = useOptimisticVoteChoice(proposalId);
  const removeOptimisticVote = useRemoveOptimisticVote();
  const reportError = useReportError();
  const [, setToast] = useToast();
  const closeProposal = useCloseProposal(spaceId);

  // Which side the user just clicked. Held locally so the confirmed pill can
  // show the right label after the tx succeeds, even if the atom clears in the
  // same tick that the server picks up the vote.
  const [pendingChoice, setPendingChoice] = useState<'ACCEPT' | 'REJECT' | null>(null);

  // Server-provided view of the user's own vote. Matches on personal-space ID
  // because that's what the vote stores as `accountId`.
  const serverUserVote = React.useMemo(() => {
    if (!personalSpaceId) return undefined;
    const target = personalSpaceId.toLowerCase();
    return votes.find(v => v.accountId.toLowerCase() === target)?.vote;
  }, [personalSpaceId, votes]);

  // Deliberately do NOT clear the optimistic atom here even once serverUserVote
  // resolves. The governance list uses the atom (via useIsOptimisticallyVoted)
  // to sink voted cards to the bottom because the API-side sort's own
  // "userVote" gate is silently disabled (isValidUUID rejects wallet addresses),
  // so p.userVote is always undefined server-side. Clearing the atom would
  // un-sink the card the moment the user reopens the proposal. The atom is
  // memory-only and resets on page reload, so it can't grow unbounded.

  // Indexer lag after a vote is variable — a single delayed refresh often lands
  // before the vote is indexed and nothing updates the tallies. Fire a short
  // backoff so a fast index gets picked up right away and a slow one still
  // catches up. Deliberately NOT tracked for cleanup on unmount: a common flow
  // is "cast vote → close modal" (which unmounts this component), and the
  // governance list BEHIND the modal must still refresh. router.refresh() on a
  // subsequently-navigated route is harmless — it just refreshes wherever the
  // user is now.
  const onVoteSuccess = () => {
    for (const delayMs of [800, 3_000, 7_000, 15_000, 30_000]) {
      window.setTimeout(() => router.refresh(), delayMs);
    }
  };

  const onVoteError = (choice: 'ACCEPT' | 'REJECT') => (error: unknown) => {
    setPendingChoice(null);
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
      setPendingChoice(choice);
      addOptimisticVote(proposalId, choice);
      vote(choice, { onSuccess: onVoteSuccess, onError: onVoteError(choice) });
    });
  };

  const onApprove = () => {
    setPendingChoice('ACCEPT');
    addOptimisticVote(proposalId, 'ACCEPT');
    vote('ACCEPT', { onSuccess: onVoteSuccess, onError: onVoteError('ACCEPT') });
  };

  const onReject = () => {
    setPendingChoice('REJECT');
    addOptimisticVote(proposalId, 'REJECT');
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

  // Prefer the server view (survives page reload). While the vote tx is
  // in-flight we keep the Accept/Reject buttons visible with an in-button
  // spinner — swapping to the pill mid-tx looked like the vote had already
  // landed. `optimisticVote` is a session fallback so a modal-close-then-reopen
  // right after voting doesn't blink back to the buttons.
  const isPending = voteStatus === 'pending';
  const txSucceeded = voteStatus === 'success';
  const confirmedVote =
    serverUserVote ?? (txSucceeded && pendingChoice ? pendingChoice : undefined) ?? (isPending ? undefined : optimisticVote);

  if (confirmedVote === 'ACCEPT') {
    return (
      <div className="inline-flex h-6 items-center rounded bg-successTertiary px-1.5 text-metadata leading-none text-green">
        You accepted
      </div>
    );
  }
  if (confirmedVote === 'REJECT') {
    return (
      <div className="inline-flex h-6 items-center rounded bg-errorTertiary px-1.5 text-metadata leading-none text-red-01">
        You rejected
      </div>
    );
  }

  // Wait for the personal-space ID lookup before offering buttons. Otherwise a
  // voter reopening the page briefly sees Accept/Reject before serverUserVote
  // resolves and swaps them out for the pill.
  if (smartAccount && isEditor && !isPersonalSpaceIdLoading) {
    return (
      <div className="inline-flex items-center gap-2">
        <Button onClick={onReject} variant="error" small disabled={isPending}>
          <Pending isPending={isPending && pendingChoice === 'REJECT'}>Reject</Pending>
        </Button>
        <Button onClick={onApprove} variant="success" small disabled={isPending}>
          <Pending isPending={isPending && pendingChoice === 'ACCEPT'}>Accept</Pending>
        </Button>
      </div>
    );
  }

  return null;
}
