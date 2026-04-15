import * as React from 'react';

import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { fetchProfile } from '~/core/io/subgraph';
import { Address } from '~/core/io/substream-schema';
import {
  NavUtils,
  formatGovernanceOutcomeDate,
  formatGovernanceOutcomeTime,
  getIsProposalEnded,
  getProposalTimeRemaining,
} from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { CloseSmall } from '~/design-system/icons/close-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { GovernanceRejectedProposalMenu } from '~/partials/governance/governance-rejected-proposal-menu';

import { cachedFetchSpace } from '../space/[id]/cached-fetch-space';
import { AcceptOrRejectEditor } from './accept-or-reject-editor';
import { AcceptOrRejectMember } from './accept-or-reject-member';
import {
  ActiveProposalsForSpacesWhereEditor,
  getActiveProposalsForSpacesWhereEditor,
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';
import { fetchProposedEditorForProposal } from './fetch-proposed-editor';
import { fetchProposedMemberForProposal } from './fetch-proposed-member';
import { serializeGovernanceHomeReturnSearch } from './governance-home-return-search';

interface Props {
  connectedSpaceId?: string;
  connectedAddress?: string;
  proposalType?: 'membership' | 'content';
  page?: number;
  governanceFilters?: {
    spaceId: string;
    category: GovernanceHomeReviewCategory;
    status: GovernanceHomeStatusFilter;
  };
}

export async function PendingProposalsPage({
  connectedSpaceId,
  connectedAddress,
  proposalType,
  page = 0,
  governanceFilters,
}: Props): Promise<{ node: React.ReactNode; hasMore: boolean }> {
  const [activeProposals, profile] = await Promise.all([
    getActiveProposalsForSpacesWhereEditor(connectedSpaceId, proposalType, page, governanceFilters),
    connectedAddress ? Effect.runPromise(fetchProfile(connectedAddress)) : null,
  ]);

  if (activeProposals.proposals.length === 0) {
    return { node: null, hasMore: false };
  }

  const user =
    profile || connectedAddress
      ? {
          address: connectedAddress,
          avatarUrl: profile?.avatarUrl ?? undefined,
        }
      : null;

  const governanceHomeReturnSearch =
    governanceFilters != null
      ? serializeGovernanceHomeReturnSearch({
          tab: 'review',
          spaceId: governanceFilters.spaceId,
          category: governanceFilters.category,
          status: governanceFilters.status,
          proposalType,
        })
      : undefined;

  return {
    node: (
      <div className="space-y-2">
        {activeProposals.proposals.map(proposal => {
          switch (proposal.type) {
            case 'ADD_MEMBER':
            case 'REMOVE_MEMBER':
              return <PendingMembershipProposal key={proposal.id} proposal={proposal} user={user} />;
            default:
              return (
                <PendingContentProposal
                  key={proposal.id}
                  proposal={proposal}
                  user={user}
                  connectedSpaceId={connectedSpaceId}
                  governanceHomeReturnSearch={governanceHomeReturnSearch}
                />
              );
          }
        })}
      </div>
    ),
    hasMore: activeProposals.hasNextPage,
  };
}

type ProposalUser = {
  address: string | undefined;
  avatarUrl: string | undefined;
} | null;

type PendingMembershipProposalProps = {
  proposal: ActiveProposalsForSpacesWhereEditor['proposals'][number];
  user: ProposalUser;
};

async function PendingMembershipProposal({ proposal }: PendingMembershipProposalProps) {
  const [proposedMember, space] = await Promise.all([
    fetchProposedMemberForProposal(proposal.id),
    cachedFetchSpace(proposal.space.id),
  ]);

  if (!proposedMember || !space) {
    return null;
  }

  const proposalName = `${proposal.type === 'ADD_MEMBER' ? 'Add' : 'Remove'} ${
    proposedMember.name ?? proposedMember.address ?? proposedMember.id
  } as member`;

  return (
    <AcceptOrRejectMember
      spaceId={proposal.space.id}
      proposalId={proposal.id}
      proposalName={proposalName}
      proposedMember={{
        id: proposedMember.id,
        avatarUrl: proposedMember.avatarUrl,
        profileLink: proposedMember.profileLink,
      }}
      space={{
        id: proposal.space.id,
        name: space.entity?.name ?? null,
        image: space.entity?.image ?? PLACEHOLDER_SPACE_IMAGE,
      }}
    />
  );
}

async function getMembershipProposalName(
  type: 'ADD_EDITOR' | 'ADD_MEMBER' | 'REMOVE_EDITOR' | 'REMOVE_MEMBER',
  proposal: ActiveProposalsForSpacesWhereEditor['proposals'][number]
) {
  const profile = await (type === 'ADD_EDITOR' || type === 'ADD_MEMBER'
    ? Effect.runPromise(fetchProfile(proposal.createdBy.address))
    : fetchProposedEditorForProposal(proposal.id));

  const displayName = profile?.name ?? profile?.address ?? 'Unknown';

  switch (type) {
    case 'ADD_EDITOR':
      return `Add ${displayName} as editor`;
    case 'ADD_MEMBER':
      return `Add ${displayName} as member`;
    case 'REMOVE_EDITOR':
      return `Remove ${displayName} as editor`;
    case 'REMOVE_MEMBER':
      return `Remove ${displayName} as member`;
  }
}

async function PendingContentProposal({
  proposal,
  user,
  connectedSpaceId,
  governanceHomeReturnSearch,
}: PendingMembershipProposalProps & {
  connectedSpaceId?: string;
  governanceHomeReturnSearch?: string;
}) {
  const [space, proposalName] = await Promise.all([
    cachedFetchSpace(proposal.space.id),
    (async () => {
      switch (proposal.type) {
        case 'ADD_EDIT':
          return proposal.name;
        case 'ADD_EDITOR':
        case 'REMOVE_EDITOR':
          return await getMembershipProposalName(proposal.type, proposal);
        case 'ADD_SUBSPACE':
        case 'REMOVE_SUBSPACE':
        case 'SET_TOPIC':
          return proposal.name;
        default:
          throw new Error('Unsupported proposal type');
      }
    })(),
  ]);

  if (!space) {
    return null;
  }

  const votesCount = proposal.proposalVotes.totalCount;
  const yesVotesPercentage = votesCount > 0 ? Math.floor((proposal.proposalVotes.yesCount / votesCount) * 100) : 0;
  const noVotesPercentage = votesCount > 0 ? Math.floor((proposal.proposalVotes.noCount / votesCount) * 100) : 0;
  const isProposalEnded = getIsProposalEnded(proposal.status, proposal.endTime);
  const userVote = proposal.userVote
    ? { vote: proposal.userVote, accountId: Address(connectedSpaceId ?? '') }
    : undefined;
  const { hours, minutes } = getProposalTimeRemaining(proposal.endTime);
  const showReopenMenu =
    proposal.status === 'REJECTED' && proposal.type === 'ADD_EDIT' && isProposalEnded;
  const footerLeft =
    proposal.status === 'ACCEPTED' || proposal.status === 'REJECTED' || isProposalEnded ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-metadataMedium text-text">
        <span className="shrink-0">{formatGovernanceOutcomeDate(proposal.endTime)}</span>
        <span aria-hidden className="shrink-0 select-none text-grey-03">
          ·
        </span>
        <time
          className="shrink-0 tabular-nums"
          dateTime={new Date(proposal.endTime * 1000).toISOString()}
        >
          {formatGovernanceOutcomeTime(proposal.endTime)}
        </time>
      </div>
    ) : (
      <p className="text-metadataMedium">{`${hours}h ${minutes}m remaining`}</p>
    );

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-grey-02 p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={NavUtils.toProposal(proposal.space.id, proposal.id, 'home', governanceHomeReturnSearch)}
          className="min-w-0 flex-1"
        >
          <div className="text-smallTitle">{proposalName}</div>
        </Link>
        {showReopenMenu ? (
          <GovernanceRejectedProposalMenu proposalId={proposal.id} spaceId={proposal.space.id} />
        ) : null}
      </div>
      <div className="flex w-full items-center gap-3 text-breadcrumb text-grey-04">
        <Link
          href={NavUtils.toSpace(proposal.space.id)}
          className="inline-flex items-center gap-1.5 transition-colors duration-75 hover:text-text"
        >
          <div className="relative h-3 w-3 overflow-hidden rounded-full">
            <ThumbGeoImage
              value={space.entity?.image ?? PLACEHOLDER_SPACE_IMAGE}
              alt={`Cover image for space ${space.entity?.name ?? space.id}`}
            />
          </div>
          <p>{space.entity?.name ?? proposal.space.id}</p>
        </Link>
        <span className="text-grey-03">&middot;</span>
        <div className="inline-flex items-center gap-1.5">
          <span className="relative h-3 w-3 overflow-hidden rounded-full">
            <Avatar size={12} avatarUrl={proposal.createdBy.avatarUrl} value={proposal.createdBy.id} />
          </span>
          <p>{proposal.createdBy.name ?? proposal.createdBy.id}</p>
        </div>
      </div>
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center gap-2 text-metadataMedium">
          {userVote?.vote === 'ACCEPT' ? (
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
            </div>
          ) : (
            <div className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-grey-04 *:h-2! *:w-auto">
              <TickSmall />
            </div>
          )}
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute top-0 bottom-0 left-0 bg-green" style={{ width: `${yesVotesPercentage}%` }} />
          </div>
          <p>{yesVotesPercentage}%</p>
        </div>
        <div className="flex items-center gap-2 text-metadataMedium">
          {userVote?.vote === 'REJECT' ? (
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={user?.avatarUrl} value={user?.address} />
            </div>
          ) : (
            <div className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-grey-04 *:h-2! *:w-auto">
              <CloseSmall />
            </div>
          )}
          <div className="relative h-1 w-full overflow-clip rounded-full bg-grey-02">
            <div className="absolute top-0 bottom-0 left-0 bg-red-01" style={{ width: `${noVotesPercentage}%` }} />
          </div>
          <p>{noVotesPercentage}%</p>
        </div>
      </div>
      <div className="flex w-full items-center justify-between">
        {footerLeft}

        <AcceptOrRejectEditor
          spaceId={proposal.space.id}
          proposalId={proposal.id}
          isProposalEnded={isProposalEnded}
          canExecute={proposal.canExecute}
          status={proposal.status}
          userVote={userVote}
        />
      </div>
    </div>
  );
}
