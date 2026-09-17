import * as React from 'react';

import { Effect } from 'effect';
import { redirect } from 'next/navigation';

import { getEntityCommentCount } from '~/core/io/queries';
import { fetchProposal } from '~/core/io/subgraph';
import {
  getIsProposalEnded,
  getMembershipProposalDisplayName,
  getNoVotePercentage,
  getProposalName,
  getProposalTimeRemaining,
  getYesVotePercentage,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GovernanceOutcomeDate, GovernanceOutcomeTime } from '~/partials/governance/governance-outcome-timestamp';
import { ProposalPathLabel } from '~/partials/governance/proposal-path-label';

import { AcceptOrReject } from './accept-or-reject';
import { MetadataMotionContainer } from './active-proposal-metadata-motion-container';
import { ActiveProposalSlideUp } from './active-proposal-slide-up';
import { CloseProposalButton } from './close-proposal-button';
import { ContentProposal } from './content-proposal';
import { ProposalBountiesProvider, ProposalBountyHeadButton, ProposalBountyPanel } from './proposal-bounty-links';
import { ProposalCommentsHeadButton, ProposalCommentsPanel, ProposalCommentsProvider } from './proposal-comments-panel';
import { ProposalVoteRow } from './proposal-vote-row';
import { SpaceTopicProposal } from './space-topic-proposal';
import { SubspaceProposal } from './subspace-proposal';
import { VotingSettingsProposal } from './voting-settings-proposal';

interface Props {
  proposalId?: string;
  spaceId: string;
  reviewComponent?: React.ReactNode;
}

export function ActiveProposal({ proposalId, spaceId }: Props) {
  return (
    <ActiveProposalSlideUp proposalId={proposalId} spaceId={spaceId}>
      <React.Suspense fallback="Loading...">
        <ReviewProposal proposalId={proposalId} spaceId={spaceId} />
      </React.Suspense>
    </ActiveProposalSlideUp>
  );
}

async function ReviewProposal({ proposalId, spaceId }: Props) {
  if (!proposalId) {
    return null;
  }

  // Every proposal has a system entity at its own id, in its own space, so its comments are the
  // comments on that entity and nothing new has to be stored (GEO-2907). Counted here so the button
  // can say how many there are before the panel is opened; a failed count reads as none rather than
  // taking the page down over a number beside an icon.
  //
  // Started alongside the proposal rather than after it. The count only needs the id we were already
  // given — `proposal.id` is the same proposal, and the API resolves either spelling of it — so
  // awaiting the proposal first would put a second round trip in front of this Suspense boundary for
  // nothing, on a path every scheduled `router.refresh()` walks again. An id with no proposal behind
  // it spends one cheap count query before redirecting, which is the whole cost of not serialising.
  const [proposal, commentCount] = await Promise.all([
    fetchProposal({ id: proposalId }),
    Effect.runPromise(getEntityCommentCount(proposalId)).catch(() => 0),
  ]);

  if (!proposal) {
    redirect(`/space/${spaceId}/governance`);
  }

  const votes = proposal.proposalVotes.nodes;
  const votesCount = proposal.proposalVotes.totalCount;

  const yesVotesPercentage = getYesVotePercentage(votes, votesCount);
  const noVotesPercentage = getNoVotePercentage(votes, votesCount);
  const isProposalEnded = getIsProposalEnded(proposal.status, proposal.endTime);
  const { hours, minutes } = getProposalTimeRemaining(proposal.endTime);
  const isSubspaceProposal = proposal.type === 'ADD_SUBSPACE' || proposal.type === 'REMOVE_SUBSPACE';
  const isSpaceTopicProposal = proposal.type === 'SET_TOPIC';
  const isVotingSettingsProposal = proposal.type === 'UPDATE_VOTING_SETTINGS';
  // Membership proposals are about the target person, not the proposer (which
  // for join requests is the DAO space itself) — show them in title and byline.
  const proposalTitle = proposal.targetProfile
    ? getMembershipProposalDisplayName(proposal.type, proposal.targetProfile)
    : (proposal.name ??
      (isVotingSettingsProposal
        ? 'Change governance settings'
        : getProposalName({ name: proposal.id, type: proposal.type, space: proposal.space })));
  const bylineProfile = proposal.targetProfile ?? proposal.createdBy;

  const isAddEdit = proposal.type === 'ADD_EDIT';
  const proposalStatusLabel = isProposalEnded
    ? proposal.status === 'ACCEPTED'
      ? 'Accepted'
      : proposal.status === 'REJECTED'
        ? 'Rejected'
        : proposal.canExecute
          ? 'Pending execution'
          : 'Rejected'
    : proposal.endTime <= 0
      ? 'Voting period open'
      : `${hours}h ${minutes}m remaining`;

  const body = (
    <>
      <div className="sticky top-0 z-50 flex h-11 w-full items-center justify-between gap-1 border-b border-divider bg-white px-4 text-button text-text">
        <div className="inline-flex items-center gap-4">
          <CloseProposalButton spaceId={spaceId} />
          <p>Review proposal</p>
        </div>

        <div className="inline-flex shrink-0 items-center gap-2">
          {/* The pills first, then one divider, then the decision. The divider used to be emitted
              by the bounty button, which meant it only appeared on an edit proposal and would have
              doubled once a second pill sat beside it. It belongs to the group, not to a member.
              `last:hidden` because `AcceptOrReject` renders nothing for a non-editor with no vote
              of their own — the common case for a visitor — and a divider with nothing after it is
              a stray line. */}
          {isAddEdit && <ProposalBountyHeadButton />}
          <ProposalCommentsHeadButton />
          <span aria-hidden className="h-4 w-px shrink-0 self-center bg-grey-02 last:hidden" />
          <AcceptOrReject
            spaceId={spaceId}
            proposalId={proposal.id}
            proposalVersion={proposal.version}
            isProposalEnded={isProposalEnded}
            status={proposal.status}
            canExecute={proposal.canExecute}
            proposalType={proposal.type}
            votes={votes}
          />
        </div>
      </div>
      <div className="flex min-h-[calc(100vh-44px)] w-full items-stretch gap-2 bg-[#EDEEF3] p-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="overflow-x-clip rounded-lg border border-grey-02 bg-white">
            <MetadataMotionContainer>
              <div className="mx-auto max-w-[1200px] px-6 py-10">
                <div className="flex flex-col items-center gap-8">
                  <div className="flex flex-col items-center gap-3">
                    <div className="text-mediumTitle">{proposalTitle}</div>
                    <div className="flex items-center justify-between">
                      <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-metadataMedium">
                        {bylineProfile.profileLink ? (
                          <Link
                            href={bylineProfile.profileLink}
                            className="flex min-w-0 items-center gap-2 transition-colors duration-75 hover:text-text"
                          >
                            <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
                              <Avatar avatarUrl={bylineProfile.avatarUrl} value={bylineProfile.address} />
                            </div>
                            <p className="text-grey-04">{bylineProfile.name ?? bylineProfile.address}</p>
                          </Link>
                        ) : (
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
                              <Avatar avatarUrl={bylineProfile.avatarUrl} value={bylineProfile.address} />
                            </div>
                            <p className="text-grey-04">{bylineProfile.name ?? bylineProfile.address}</p>
                          </div>
                        )}
                        {isProposalEnded && (proposal.status === 'ACCEPTED' || proposal.status === 'REJECTED') && (
                          <>
                            <span aria-hidden className="shrink-0 text-grey-04 select-none">
                              ·
                            </span>
                            <GovernanceOutcomeDate
                              geoTimeSeconds={proposal.startTime}
                              className="shrink-0 text-grey-04"
                            />
                            <span aria-hidden className="shrink-0 text-grey-04 select-none">
                              ·
                            </span>
                            <GovernanceOutcomeTime
                              geoTimeSeconds={proposal.startTime}
                              className="shrink-0 text-grey-04 tabular-nums"
                            />
                          </>
                        )}
                        {proposal.votingMode && (
                          <>
                            <span aria-hidden className="shrink-0 text-grey-04 select-none">
                              ·
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-grey-04">
                              <ProposalPathLabel votingMode={proposal.votingMode} />
                            </span>
                          </>
                        )}
                        <span aria-hidden className="shrink-0 text-grey-04 select-none">
                          ·
                        </span>
                        <span className="text-text">{proposalStatusLabel}</span>
                      </div>
                    </div>
                  </div>
                  <ProposalVoteRow
                    votes={proposal.proposalVotes.nodes}
                    votesCount={votesCount}
                    yesVotesPercentage={yesVotesPercentage}
                    noVotesPercentage={noVotesPercentage}
                    proposalId={proposal.id}
                  />
                </div>
              </div>
            </MetadataMotionContainer>
          </div>
          <div className="flex-1 overflow-x-clip rounded-lg border border-grey-02 bg-white">
            <div className="mx-auto max-w-[1200px] px-6 pt-10 pb-20 xl:pt-[40px] xl:pb-[4ch]">
              {isAddEdit && <ContentProposal proposal={proposal} spaceId={spaceId} />}
              {isSubspaceProposal && <SubspaceProposal proposal={proposal} />}
              {isSpaceTopicProposal && <SpaceTopicProposal proposal={proposal} />}
              {isVotingSettingsProposal && <VotingSettingsProposal proposal={proposal} spaceId={spaceId} />}
            </div>
          </div>
        </div>
        {isAddEdit && <ProposalBountyPanel />}
        <ProposalCommentsPanel />
      </div>
    </>
  );

  // Comments are on every proposal type — the screen in the designs is an editor request, which
  // has no diff and no bounties — so this provider wraps whatever the bounty one does or doesn't.
  //
  // The proposal's own space, not the route's. Nothing above verifies that this proposal belongs to
  // the space in the URL, and the difference is durable here rather than cosmetic: the thread's space
  // is written into every comment published on it, and it decides which space's roles the badges are
  // about. The rest of the screen reads the route's space, which is a wider question than this.
  const commentable = (
    <ProposalCommentsProvider proposalId={proposal.id} spaceId={proposal.space.id} count={commentCount}>
      {body}
    </ProposalCommentsProvider>
  );

  if (!isAddEdit) {
    return commentable;
  }

  return (
    <ProposalBountiesProvider
      daoSpaceId={spaceId}
      proposalId={proposal.id}
      proposalName={proposal.name ?? proposalTitle}
      authorSpaceId={proposal.createdBy.spaceId}
    >
      {commentable}
    </ProposalBountiesProvider>
  );
}
