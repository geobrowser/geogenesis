'use client';

import { useState, type ReactNode } from 'react';

import cx from 'classnames';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useVote } from '~/core/hooks/use-vote';
import { Proposal } from '~/core/io/dto/proposals';
import type { SubstreamVote } from '~/core/io/substream-schema';

import {
  NavUtils,
  formatGovernanceOutcomeDate,
  formatGovernanceOutcomeTime,
  getProposalTimeRemaining,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { Pending } from '~/design-system/pending';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { Execute } from '~/partials/active-proposal/execute';

interface Props {
  spaceId: string;
  proposalId: string;
  proposalName: string;
  governanceHomeReturnSearch?: string;
  endTime: number;
  isProposalEnded: boolean;
  canExecute: boolean;
  status: Proposal['status'];
  userVote: SubstreamVote | undefined;
  proposedMember: {
    id: string;
    avatarUrl: string | null;
    profileLink: string | null;
  };
  space: {
    id: string;
    name: string | null;
    image: string;
  };
}

/**
 * Membership proposal card for governance home. Matches {@link AcceptOrRejectEditor} so completed
 * proposals show Accepted / Rejected (or execution) instead of vote buttons.
 */
export function AcceptOrRejectMember({
  spaceId,
  proposalId,
  proposalName,
  governanceHomeReturnSearch,
  endTime,
  isProposalEnded,
  canExecute,
  status,
  userVote,
  proposedMember,
  space,
}: Props) {
  const [selectedVote, setSelectedVote] = useState<'ACCEPT' | 'REJECT' | null>(null);

  const { vote, status: voteStatus } = useVote({
    spaceId,
    proposalId,
  });

  const hasVoted = voteStatus === 'success';
  const hasError = voteStatus === 'error';
  const isPendingApproval = selectedVote === 'ACCEPT' && voteStatus === 'pending';
  const isPendingRejection = selectedVote === 'REJECT' && voteStatus === 'pending';

  const { smartAccount } = useSmartAccount();

  const onApprove = () => {
    setSelectedVote('ACCEPT');
    vote('ACCEPT');
  };

  const onReject = () => {
    setSelectedVote('REJECT');
    vote('REJECT');
  };

  const { hours, minutes } = getProposalTimeRemaining(endTime);

  const footerLeft =
    status === 'ACCEPTED' || status === 'REJECTED' || isProposalEnded ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-metadataMedium text-text">
        <span className="shrink-0">{formatGovernanceOutcomeDate(endTime)}</span>
        <span aria-hidden className="shrink-0 select-none text-grey-03">
          ·
        </span>
        <time className="shrink-0 tabular-nums" dateTime={new Date(endTime * 1000).toISOString()}>
          {formatGovernanceOutcomeTime(endTime)}
        </time>
      </div>
    ) : (
      <p className="text-metadataMedium">{`${hours}h ${minutes}m remaining`}</p>
    );

  const proposalHref = NavUtils.toProposal(spaceId, proposalId, 'home', governanceHomeReturnSearch);

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1 text-smallTitle">{proposalName}</div>
      <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
        <Avatar avatarUrl={proposedMember.avatarUrl} value={proposedMember.id} size={20} />
      </div>
    </div>
  );

  let actions: ReactNode;

  if (isProposalEnded) {
    if (status === 'ACCEPTED') {
      actions = <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">Accepted</div>;
    } else if (status === 'REJECTED') {
      actions = <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">Rejected</div>;
    } else if (canExecute && smartAccount) {
      actions = <Execute spaceId={spaceId} proposalId={proposalId} variant="small" />;
    } else if (canExecute) {
      actions = (
        <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">Pending execution</div>
      );
    } else {
      actions = <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">Rejected</div>;
    }
  } else if (userVote || hasVoted) {
    if (userVote?.vote === 'ACCEPT' || selectedVote === 'ACCEPT') {
      actions = (
        <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">You accepted</div>
      );
    } else {
      actions = <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">You rejected</div>;
    }
  } else if (!isProposalEnded && smartAccount) {
    actions = hasError ? (
      <div className="flex items-center gap-2">
        <p className="text-smallButton text-red-01">Vote failed</p>
        <SmallButton
          variant="secondary"
          onClick={() => {
            if (selectedVote) vote(selectedVote);
          }}
        >
          Retry
        </SmallButton>
      </div>
    ) : (
      <div className="relative">
        <div className={cx('flex items-center gap-2', hasVoted && 'invisible')}>
          <SmallButton variant="secondary" onClick={onReject} disabled={voteStatus !== 'idle'}>
            <Pending isPending={isPendingRejection}>Reject</Pending>
          </SmallButton>
          <SmallButton variant="secondary" onClick={onApprove} disabled={voteStatus !== 'idle'}>
            <Pending isPending={isPendingApproval}>Approve</Pending>
          </SmallButton>
        </div>
        {hasVoted && (
          <div className="absolute inset-0 flex h-full w-full items-center justify-center">
            <div className="text-smallButton">{selectedVote === 'ACCEPT' ? 'Approved' : 'Rejected'}</div>
          </div>
        )}
      </div>
    );
  } else {
    actions = null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        <Link href={proposalHref} className="block w-full">
          {header}
        </Link>
        {proposedMember.profileLink ? (
          <Link
            href={proposedMember.profileLink}
            className="inline-block text-breadcrumb text-grey-04 underline transition-colors hover:text-text"
          >
            View member profile
          </Link>
        ) : null}

        <Link href={NavUtils.toSpace(space.id)} className="flex items-center gap-1.5 text-breadcrumb text-grey-04">
          <div className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text">
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <ThumbGeoImage value={space.image} alt={`Cover image for space ${space.name ?? space.id}`} />
            </div>
            <p>{space.name}</p>
          </div>
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3">
        {footerLeft}
        {actions}
      </div>
    </div>
  );
}
