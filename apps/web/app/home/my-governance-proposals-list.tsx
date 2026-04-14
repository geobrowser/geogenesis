import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { fetchProfileBySpaceId } from '~/core/io/subgraph';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';
import { getMyGovernanceProposals } from './fetch-my-governance-proposals';
import { serializeGovernanceHomeReturnSearch } from './governance-home-return-search';
import { MyGovernanceProposalCard } from './my-governance-proposal-card';

type Props = {
  memberSpaceId: string;
  /** Wallet address hint for `/profile/space` when the API omits address */
  viewerWalletAddress?: string | null;
  spaceIds: string[];
  spaceFilter?: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
  governanceTab: 'review' | 'my';
  proposalType?: 'membership' | 'content';
};

export async function MyGovernanceProposalsList({
  memberSpaceId,
  viewerWalletAddress,
  spaceIds,
  spaceFilter,
  category,
  status,
  governanceTab,
  proposalType,
}: Props) {
  const { proposals } = await getMyGovernanceProposals({
    memberSpaceId,
    spaceIds,
    spaceFilter,
    category,
    status,
    page: 0,
  });

  if (proposals.length === 0) {
    return <p className="text-body text-grey-04">No proposals match these filters.</p>;
  }

  const spaces = await Promise.all(proposals.map(p => cachedFetchSpace(p.spaceId)));
  const spaceById = new Map(proposals.map((p, i) => [p.spaceId, spaces[i]]));

  const viewerProfile = await Effect.runPromise(
    fetchProfileBySpaceId(memberSpaceId, viewerWalletAddress ?? undefined)
  ).catch(() => null);

  const governanceHomeReturnSearch = serializeGovernanceHomeReturnSearch({
    tab: governanceTab,
    spaceId: spaceFilter ?? 'all',
    category,
    status,
    proposalType,
  });

  return (
    <div className="space-y-2">
      {proposals.map(p => {
        const space = spaceById.get(p.spaceId);
        const spaceName = space?.entity?.name ?? p.spaceId;
        const spaceImage = space?.entity?.image ?? PLACEHOLDER_SPACE_IMAGE;
        const creator = p.createdBy;
        const creatorName = creator.name ?? creator.address ?? creator.id;
        const creatorValue = creator.address ?? creator.id;

        return (
          <MyGovernanceProposalCard
            key={p.id}
            spaceId={p.spaceId}
            proposalId={p.id}
            displayTitle={p.displayTitle}
            spaceName={spaceName}
            spaceImage={spaceImage}
            creatorName={creatorName}
            creatorAvatarUrl={creator.avatarUrl}
            creatorValue={creatorValue}
            endTime={p.endTime}
            status={p.status}
            canExecute={p.canExecute}
            proposalType={p.type}
            yesCount={p.proposalVotes.yesCount}
            noCount={p.proposalVotes.noCount}
            totalVotes={p.proposalVotes.totalCount}
            userVote={p.userVote}
            viewerAvatarUrl={viewerProfile?.avatarUrl}
            viewerAddress={viewerProfile?.address}
            governanceHomeReturnSearch={governanceHomeReturnSearch}
          />
        );
      })}
    </div>
  );
}
