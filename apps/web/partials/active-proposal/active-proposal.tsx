import { redirect } from 'next/navigation';

import * as React from 'react';

import { fetchProposal } from '~/core/io/subgraph';
import {
  getIsProposalEnded,
  getNoVotePercentage,
  getProposalTimeRemaining,
  getUserVote,
  getYesVotePercentage,
  toTitleCase,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { AcceptOrReject } from './accept-or-reject';
import { MetadataMotionContainer } from './active-proposal-metadata-motion-container';
import { ShowVoters } from './active-proposal-show-voters';
import { ActiveProposalSlideUp } from './active-proposal-slide-up';
import { CloseProposalButton } from './close-proposal-button';
import { ContentProposal } from './content-proposal';
import { SubspaceProposal } from './subspace-proposal';


interface Props {
  proposalId?: string;
  connectedAddress: string | undefined;
  spaceId: string;
  reviewComponent?: React.ReactNode;
}

export function ActiveProposal({ proposalId, spaceId, connectedAddress }: Props) {
  return (
    <ActiveProposalSlideUp proposalId={proposalId}>
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

  return (
    <>
      <div className="sticky top-0 z-50 flex w-full items-center justify-between gap-1 border-b border-divider bg-white px-4 py-1 text-button text-text md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <CloseProposalButton />
          <p>Review proposal</p>
        </div>

        <AcceptOrReject
          spaceId={spaceId}
          proposalId={proposal.id}
          isProposalEnded={isProposalEnded}
          status={proposal.status}
          userVote={userVote}
        />
      </div>
      <div className="relative overflow-x-clip">
        <MetadataMotionContainer>
          <div className="mx-auto max-w-[1200px] py-10 xl:pl-[2ch] xl:pr-[2ch]">
            <div className="flex flex-col items-center gap-8">
              <div className="flex flex-col items-center gap-3">
                <div className="text-mediumTitle">{proposal.name}</div>
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-metadataMedium">
                    <Link
                      href={proposal.createdBy.profileLink ?? ''}
                      className="flex items-center gap-2 transition-colors duration-75 hover:text-text"
                    >
                      <div className="relative h-3 w-3 overflow-hidden rounded-full">
                        <Avatar avatarUrl={proposal.createdBy.avatarUrl} value={proposal.createdBy.address} />
                      </div>
                      <p className="text-grey-04">{proposal.createdBy.name ?? proposal.createdBy.address}</p>
                    </Link>
                    <span className="text-grey-04">·</span>
                    <span className="text-text">
                      {isProposalEnded ? toTitleCase(proposal.status) : `${hours}h ${minutes}m remaining`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex w-full gap-[60px]">
                <div className="flex w-1/2 items-center gap-2 text-metadataMedium">
                  <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
                    <Tick />
                  </div>
                  <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
                    <div
                      className="absolute bottom-0 left-0 top-0 bg-green"
                      style={{ width: `${yesVotesPercentage}%` }}
                    />
                  </div>
                  <div>{yesVotesPercentage}%</div>
                </div>
                <div className="flex w-1/2 items-center gap-2 text-metadataMedium">
                  <div className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-grey-04 [&>*]:!h-2 [&>*]:w-auto">
                    <Close />
                  </div>
                  <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
                    <div
                      className="absolute bottom-0 left-0 top-0 bg-red-01"
                      style={{ width: `${noVotesPercentage}%` }}
                    />
                  </div>
                  <div>{noVotesPercentage}%</div>
                </div>
              </div>

              <ShowVoters votes={proposal.proposalVotes.nodes} votesCount={votesCount} />
            </div>
          </div>
        </MetadataMotionContainer>
        <div className="h-full overflow-x-clip border-t border-divider">
          <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
            {proposal.type === 'ADD_EDIT' && <ContentProposal proposal={proposal} spaceId={spaceId} />}
            {(proposal.type === 'ADD_SUBSPACE' || proposal.type === 'REMOVE_SUBSPACE') && (
              <SubspaceProposal proposal={proposal} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
