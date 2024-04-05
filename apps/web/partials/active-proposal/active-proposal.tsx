import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAddress } from 'viem';

import * as React from 'react';

import { fetchProposal } from '~/core/io/subgraph';
import {
  getNoVotePercentage,
  getProposalTimeRemaining,
  getYesVotePercentage,
  isProposalEnded,
  toTitleCase,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Tick } from '~/design-system/icons/tick';

import { AcceptOrReject } from './accept-or-reject';
import { MetadataMotionContainer } from './active-proposal-metadata-motion-container';
import { ShowVoters } from './active-proposal-show-voters';
import { ActiveProposalSlideUp } from './active-proposal-slide-up';
import { ContentProposal } from './content-proposal';
import { SubspaceProposal } from './subspace-proposal';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

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
        <ReviewActiveProposal connectedAddress={connectedAddress} proposalId={proposalId} spaceId={spaceId} />
      </React.Suspense>
    </ActiveProposalSlideUp>
  );
}

async function ReviewActiveProposal({ proposalId, spaceId, connectedAddress }: Props) {
  if (!proposalId) {
    return null;
  }

  const [proposal, space] = await Promise.all([fetchProposal({ id: proposalId }), cachedFetchSpace(spaceId)]);

  if (!proposal) {
    redirect(`/space/${spaceId}/governance`);
  }

  const votes = proposal.proposalVotes.nodes;
  const votesCount = proposal.proposalVotes.totalCount;

  const yesVotesPercentage = getYesVotePercentage(votes, votesCount);
  const noVotesPercentage = getNoVotePercentage(votes, votesCount);

  const isProposalDone = isProposalEnded(proposal);
  const userVote = connectedAddress ? votes.find(v => v.accountId === getAddress(connectedAddress)) : undefined;

  const { hours, minutes } = getProposalTimeRemaining(proposal.endTime);

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 text-button text-text shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <Link href={`/space/${spaceId}/governance`}>
            <SquareButton icon={<Close />} />
          </Link>
          <p>Review proposal</p>
        </div>

        {/* @TODO: Use actual voting address from substream */}
        <AcceptOrReject
          onchainProposalId={proposal.onchainProposalId}
          isProposalDone={isProposalDone}
          userVote={userVote}
          // We know that the space isn't null here, so casting is safe. If the space
          // doesn't exist we redirect the user. Eventually every space with governance
          // will have a main voting plugin address
          votingContractAddress={space?.mainVotingPluginAddress as `0x${string}`}
        />
      </div>
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
                    {isProposalDone ? toTitleCase(proposal.status) : `${hours}h ${minutes}m remaining`}
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
      <div className="rounded-t-4 mt-3 h-full overflow-y-auto overscroll-contain bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          {proposal.type === 'CONTENT' && <ContentProposal proposal={proposal} />}
          {(proposal.type === 'ADD_SUBSPACE' || proposal.type === 'REMOVE_SUBSPACE') && (
            <SubspaceProposal proposal={proposal} />
          )}
        </div>
      </div>
    </>
  );
}
