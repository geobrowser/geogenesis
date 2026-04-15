'use client';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Address, ProposalStatus, ProposalType, type SubstreamVote } from '~/core/io/substream-schema';
import {
  formatGovernanceOutcomeDate,
  formatGovernanceOutcomeTime,
  getIsProposalEnded,
  getProposalTimeRemaining,
  NavUtils,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { AcceptOrRejectEditor } from './accept-or-reject-editor';
import { GovernanceProposalVoteState } from '~/partials/governance/governance-proposal-vote-state';
import { GovernanceRejectedProposalMenu } from '~/partials/governance/governance-rejected-proposal-menu';
import { GovernanceStatusChip } from '~/partials/governance/governance-status-chip';

function percentageFromCounts(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.floor((count / total) * 100);
}

export type MyGovernanceProposalCardProps = {
  spaceId: string;
  proposalId: string;
  displayTitle: string;
  spaceName: string;
  spaceImage: string;
  creatorName: string;
  creatorAvatarUrl: string | null | undefined;
  creatorValue: string;
  endTime: number;
  status: ProposalStatus;
  canExecute: boolean;
  proposalType: ProposalType;
  yesCount: number;
  noCount: number;
  totalVotes: number;
  userVote?: 'ACCEPT' | 'REJECT' | 'ABSTAIN';
  viewerAvatarUrl?: string | null;
  viewerAddress?: string;
  /** Viewer’s personal space id (for vote account mapping). */
  viewerMemberSpaceId: string;
  /** True when the viewer is an editor of this proposal’s space and may vote (matches Review tab). */
  viewerCanVoteAsEditor: boolean;
  governanceHomeReturnSearch?: string;
};

export function MyGovernanceProposalCard({
  spaceId,
  proposalId,
  displayTitle,
  spaceName,
  spaceImage,
  creatorName,
  creatorAvatarUrl,
  creatorValue,
  endTime,
  status,
  canExecute,
  proposalType,
  yesCount,
  noCount,
  totalVotes,
  userVote,
  viewerAvatarUrl,
  viewerAddress,
  viewerMemberSpaceId,
  viewerCanVoteAsEditor,
  governanceHomeReturnSearch,
}: MyGovernanceProposalCardProps) {
  const showReopenMenu =
    status === 'REJECTED' && proposalType === 'ADD_EDIT' && getIsProposalEnded(status, endTime);

  const yesPercentage = percentageFromCounts(yesCount, totalVotes);
  const noPercentage = percentageFromCounts(noCount, totalVotes);
  const votingEnded = getIsProposalEnded(status, endTime);
  const { hours, minutes } = getProposalTimeRemaining(endTime);

  const footerDateTime =
    status === 'ACCEPTED' || status === 'REJECTED' || votingEnded ? (
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

  const userVoteSubstream: SubstreamVote | undefined =
    userVote && viewerMemberSpaceId
      ? { vote: userVote, accountId: Address(viewerMemberSpaceId) }
      : undefined;

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-grey-02 p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={NavUtils.toProposal(spaceId, proposalId, 'home', governanceHomeReturnSearch)}
          className="min-w-0 flex-1"
        >
          <div className="text-smallTitle">{displayTitle}</div>
        </Link>
        {showReopenMenu ? <GovernanceRejectedProposalMenu proposalId={proposalId} spaceId={spaceId} /> : null}
      </div>
      <div className="flex w-full items-center gap-3 text-breadcrumb text-grey-04">
        <Link
          href={NavUtils.toSpace(spaceId)}
          className="inline-flex min-w-0 items-center gap-1.5 transition-colors duration-75 hover:text-text"
        >
          <span className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
            <ThumbGeoImage value={spaceImage || PLACEHOLDER_SPACE_IMAGE} alt="" />
          </span>
          <span className="truncate">{spaceName}</span>
        </Link>
        <span className="shrink-0 text-grey-03">&middot;</span>
        <div className="inline-flex min-w-0 items-center gap-1.5">
          <span className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
            <Avatar size={12} avatarUrl={creatorAvatarUrl} value={creatorValue} />
          </span>
          <span className="truncate">{creatorName}</span>
        </div>
      </div>
      <GovernanceProposalVoteState
        yesPercentage={yesPercentage}
        noPercentage={noPercentage}
        userVote={userVote}
        user={
          viewerAddress
            ? {
                address: viewerAddress,
                avatarUrl: viewerAvatarUrl ?? null,
              }
            : undefined
        }
      />
      <div className="flex w-full items-center justify-between gap-3">
        {footerDateTime}
        {viewerCanVoteAsEditor ? (
          <AcceptOrRejectEditor
            spaceId={spaceId}
            proposalId={proposalId}
            isProposalEnded={votingEnded}
            canExecute={canExecute}
            status={status}
            userVote={userVoteSubstream}
          />
        ) : (
          <GovernanceStatusChip
            endTime={endTime}
            status={status}
            canExecute={canExecute}
            viewerVote={userVote}
          />
        )}
      </div>
    </div>
  );
}
