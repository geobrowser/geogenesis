import * as React from 'react';

import { redirect } from 'next/navigation';

import { fetchProposal } from '~/core/io/subgraph';
import {
  formatGovernanceOutcomeDate,
  formatGovernanceOutcomeTime,
  getIsProposalEnded,
  getNoVotePercentage,
  getProposalName,
  getProposalTimeRemaining,
  getUserVote,
  getYesVotePercentage,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { AcceptOrReject } from './accept-or-reject';
import {
  ProposalBountiesProvider,
  ProposalBountyHeadButton,
  ProposalBountyPanel,
} from './proposal-bounty-links';
import { MetadataMotionContainer } from './active-proposal-metadata-motion-container';
import { ProposalVoteRow } from './proposal-vote-row';
import { ActiveProposalSlideUp } from './active-proposal-slide-up';
import { CloseProposalButton } from './close-proposal-button';
import { ContentProposal } from './content-proposal';
import { SpaceTopicProposal } from './space-topic-proposal';
import { SubspaceProposal } from './subspace-proposal';

interface Props {
  proposalId?: string;
  connectedAddress: string | undefined;
  spaceId: string;
  reviewComponent?: React.ReactNode;
}

export function ActiveProposal({ proposalId, spaceId, connectedAddress }: Props) {
  return (
    <ActiveProposalSlideUp proposalId={proposalId} spaceId={spaceId}>
      <React.Suspense fallback="Loading...">
        <ReviewProposal connectedAddress={connectedAddress} proposalId={proposalId} spaceId={spaceId} />
      </React.Suspense>
    </ActiveProposalSlideUp>
  );
}

async function ReviewProposal({ proposalId, spaceId, connectedAddress }: Props) {
  if (!proposalId) {
    return null;
  }

  const proposal = await fetchProposal({ id: proposalId });

  if (!proposal) {
    redirect(`/space/${spaceId}/governance`);
  }

  const votes = proposal.proposalVotes.nodes;
  const votesCount = proposal.proposalVotes.totalCount;

  const yesVotesPercentage = getYesVotePercentage(votes, votesCount);
  const noVotesPercentage = getNoVotePercentage(votes, votesCount);
  const isProposalEnded = getIsProposalEnded(proposal.status, proposal.endTime);
  const userVote = connectedAddress ? getUserVote(votes, connectedAddress) : undefined;
  const { hours, minutes } = getProposalTimeRemaining(proposal.endTime);
  const isSubspaceProposal = proposal.type === 'ADD_SUBSPACE' || proposal.type === 'REMOVE_SUBSPACE';
  const isSpaceTopicProposal = proposal.type === 'SET_TOPIC';
  const proposalTitle =
    proposal.name ?? getProposalName({ name: proposal.id, type: proposal.type, space: proposal.space });

  const isAddEdit = proposal.type === 'ADD_EDIT';

  const body = (
    <>
      <div className="sticky top-0 z-50 flex h-11 w-full items-center justify-between gap-1 border-b border-divider bg-white px-4 text-button text-text">
        <div className="inline-flex items-center gap-4">
          <CloseProposalButton spaceId={spaceId} />
          <p>Review proposal</p>
        </div>

        <div className="inline-flex shrink-0 items-center gap-2">
          {isAddEdit && <ProposalBountyHeadButton />}
          <AcceptOrReject
            spaceId={spaceId}
            proposalId={proposal.id}
            isProposalEnded={isProposalEnded}
            status={proposal.status}
            canExecute={proposal.canExecute}
            proposalType={proposal.type}
            userVote={userVote}
          />
        </div>
      </div>
      <div className="flex w-full items-stretch gap-2 bg-[#EDEEF3] p-2 min-h-[calc(100vh-44px)]">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="overflow-x-clip rounded-lg border border-grey-02 bg-white">
            <MetadataMotionContainer>
              <div className="mx-auto max-w-[1200px] px-6 py-10">
                <div className="flex flex-col items-center gap-8">
                  <div className="flex flex-col items-center gap-3">
                    <div className="text-mediumTitle">{proposalTitle}</div>
                    <div className="flex items-center justify-between">
                      <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-metadataMedium">
                        {proposal.createdBy.profileLink ? (
                          <Link
                            href={proposal.createdBy.profileLink}
                            className="flex min-w-0 items-center gap-2 transition-colors duration-75 hover:text-text"
                          >
                            <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
                              <Avatar avatarUrl={proposal.createdBy.avatarUrl} value={proposal.createdBy.address} />
                            </div>
                            <p className="text-grey-04">{proposal.createdBy.name ?? proposal.createdBy.address}</p>
                          </Link>
                        ) : (
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
                              <Avatar avatarUrl={proposal.createdBy.avatarUrl} value={proposal.createdBy.address} />
                            </div>
                            <p className="text-grey-04">{proposal.createdBy.name ?? proposal.createdBy.address}</p>
                          </div>
                        )}
                        {isProposalEnded &&
                          (proposal.status === 'ACCEPTED' || proposal.status === 'REJECTED') && (
                            <>
                              <span aria-hidden className="shrink-0 select-none text-grey-04">
                                ·
                              </span>
                              <span className="shrink-0 text-grey-04">
                                {formatGovernanceOutcomeDate(proposal.endTime)}
                              </span>
                              <span aria-hidden className="shrink-0 select-none text-grey-04">
                                ·
                              </span>
                              <time
                                className="shrink-0 tabular-nums text-grey-04"
                                dateTime={new Date(proposal.endTime * 1000).toISOString()}
                              >
                                {formatGovernanceOutcomeTime(proposal.endTime)}
                              </time>
                            </>
                          )}
                        <span aria-hidden className="shrink-0 select-none text-grey-04">
                          ·
                        </span>
                        <span className="text-text">
                          {isProposalEnded
                            ? proposal.status === 'ACCEPTED'
                              ? 'Accepted'
                              : proposal.status === 'REJECTED'
                                ? 'Rejected'
                                : proposal.canExecute
                                  ? 'Pending execution'
                                  : 'Rejected'
                            : `${hours}h ${minutes}m remaining`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ProposalVoteRow
                    votes={proposal.proposalVotes.nodes}
                    votesCount={votesCount}
                    yesVotesPercentage={yesVotesPercentage}
                    noVotesPercentage={noVotesPercentage}
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
            </div>
          </div>
        </div>
        {isAddEdit && <ProposalBountyPanel />}
      </div>
    </>
  );

  if (!isAddEdit) {
    return body;
  }

  return (
    <ProposalBountiesProvider
      daoSpaceId={spaceId}
      proposalId={proposal.id}
      proposalName={proposal.name ?? proposalTitle}
      authorSpaceId={proposal.createdBy.spaceId}
    >
      {body}
    </ProposalBountiesProvider>
  );
}
