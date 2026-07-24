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
import { Check } from '~/design-system/icons/check';
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

  // The user's effective vote right now. Prefer the server view (survives page
  // reload), then a just-succeeded local choice, then the optimistic session
  // fallback so a modal close-then-reopen right after voting doesn't blink. We
  // resolve to `undefined` while a tx is in-flight so the buttons stay
  // interactive with an in-button spinner rather than snapping mid-tx.
  const isPending = voteStatus === 'pending';
  const txSucceeded = voteStatus === 'success';
  const confirmedVote =
    serverUserVote ?? (txSucceeded && pendingChoice ? pendingChoice : undefined) ?? (isPending ? undefined : optimisticVote);

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

  const onVoteError = (choice: 'ACCEPT' | 'REJECT', isChange: boolean) => (error: unknown) => {
    setPendingChoice(null);
    removeOptimisticVote(proposalId);
    // A stale proposal can't be voted through — retrying would revert again, so
    // toast instead of raising the retry error modal. For a first vote we also
    // close the review window (the proposal has moved on). For a *change* we
    // keep the window open and tell the user their original vote stands, so a
    // DAO that doesn't allow vote replacement degrades to a clear message
    // instead of looking like the vote disappeared.
    const staleMessage = getStaleProposalVoteToastMessage(error, proposalType, { isVoteChange: isChange });
    if (staleMessage) {
      setToast(<span>{staleMessage}</span>);
      if (!isChange) closeProposal();
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
  // no-op: re-affirming the same choice would just spend a transaction (and, in
  // a replacement-enabled DAO, overwrite your vote with itself).
  const submitVote = (choice: 'ACCEPT' | 'REJECT') => {
    if (confirmedVote === choice) return;
    const isChange = confirmedVote != null && confirmedVote !== choice;
    setPendingChoice(choice);
    addOptimisticVote(proposalId, choice);
    vote(choice, { onSuccess: onVoteSuccess, onError: onVoteError(choice, isChange) });
  };

  const onApprove = () => submitVote('ACCEPT');
  const onReject = () => submitVote('REJECT');

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

  // Editors vote here — and, while the proposal is still open, can change their
  // vote. The current choice is shown filled with a check and is inert (its
  // handler no-ops); the other side is a live button that submits a replacement
  // vote. We wait for the personal-space lookup so a voter reopening the page
  // doesn't briefly see an un-highlighted pair before serverUserVote resolves.
  if (smartAccount && isEditor && !isPersonalSpaceIdLoading) {
    const hasAccepted = confirmedVote === 'ACCEPT';
    const hasRejected = confirmedVote === 'REJECT';
    return (
      <div className="inline-flex items-center gap-2">
        <Button
          onClick={onReject}
          variant="error"
          small
          icon={hasRejected ? <Check /> : undefined}
          className={hasRejected ? 'cursor-default' : undefined}
          aria-pressed={hasRejected}
          disabled={isPending}
        >
          <Pending isPending={isPending && pendingChoice === 'REJECT'}>{hasRejected ? 'Rejected' : 'Reject'}</Pending>
        </Button>
        <Button
          onClick={onApprove}
          variant="success"
          small
          icon={hasAccepted ? <Check /> : undefined}
          className={hasAccepted ? 'cursor-default' : undefined}
          aria-pressed={hasAccepted}
          disabled={isPending}
        >
          <Pending isPending={isPending && pendingChoice === 'ACCEPT'}>{hasAccepted ? 'Accepted' : 'Accept'}</Pending>
        </Button>
      </div>
    );
  }

  // Non-editors (or before the account lookup resolves) can't vote — surface
  // their recorded vote read-only if they have one.
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

  return null;
}
