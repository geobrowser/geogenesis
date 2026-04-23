import * as React from 'react';

import { SidebarCounts } from '~/core/io/fetch-sidebar-counts';

import { Skeleton } from '~/design-system/skeleton';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
} from './fetch-active-proposals-in-editor-spaces';
import { HomeProposalsInfiniteScroll } from './home-proposals-infinite-scroll';
import { MyGovernanceProposalsList } from './my-governance-proposals-list';
import { PendingProposalsPage } from './pending-proposals-page';
import { PersonalHomeDashboard } from './personal-home-dashboard';

type GovernanceFilters = {
  spaceId: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
};

type Props = {
  header: React.ReactNode;
  sidebarCounts?: SidebarCounts;
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
  connectedSpaceId?: string;
  governanceTab: 'review' | 'my';
  governanceFilters: GovernanceFilters;
  editorSpaceOptions: { id: string; name: string; image: string | null }[];
  myProposalSpaceOptions: { id: string; name: string; image: string | null }[];
  myProposalSpaceIds: string[];
};

export async function Component({
  header,
  sidebarCounts,
  proposalType,
  connectedAddress,
  connectedSpaceId,
  governanceTab,
  governanceFilters,
  editorSpaceOptions,
  myProposalSpaceOptions,
  myProposalSpaceIds,
}: Props) {
  const listKey = `${governanceTab}-${governanceFilters.spaceId}-${governanceFilters.category}-${governanceFilters.status}-${proposalType}-${connectedAddress}`;

  return (
    <>
      <div className="mx-auto w-full max-w-[880px]">
        {header}
        <PersonalHomeDashboard
          governanceTab={governanceTab}
          governanceFilters={governanceFilters}
          editorSpaceOptions={editorSpaceOptions}
          myProposalSpaceOptions={myProposalSpaceOptions}
          proposalsList={
            governanceTab === 'my' && !connectedSpaceId ? (
              <p className="text-body text-grey-04">Sign in to see your proposals.</p>
            ) : governanceTab === 'my' && connectedSpaceId ? (
              <React.Suspense
                key={listKey}
                fallback={
                  <div className="space-y-2">
                    <LoadingSkeleton />
                    <LoadingSkeleton />
                  </div>
                }
              >
                <MyGovernanceProposalsList
                  memberSpaceId={connectedSpaceId}
                  viewerWalletAddress={connectedAddress}
                  spaceIds={myProposalSpaceIds}
                  spaceFilter={governanceFilters.spaceId}
                  category={governanceFilters.category}
                  status={governanceFilters.status}
                  governanceTab={governanceTab}
                  proposalType={proposalType}
                />
              </React.Suspense>
            ) : (
              <React.Suspense
                key={listKey}
                fallback={
                  <div className="space-y-2">
                    <LoadingSkeleton />
                    <LoadingSkeleton />
                    <LoadingSkeleton />
                  </div>
                }
              >
                <PendingProposals
                  connectedAddress={connectedAddress}
                  connectedSpaceId={connectedSpaceId}
                  proposalType={proposalType}
                  governanceFilters={governanceFilters}
                />
              </React.Suspense>
            )
          }
          sidebarCounts={sidebarCounts}
        />
      </div>
    </>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-grey-02 p-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-5 w-48" />
    </div>
  );
}

function NoActivity() {
  return <p className="mb-4 text-body text-grey-04">You have no pending requests or proposals.</p>;
}

type PendingProposalsProps = {
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
  connectedSpaceId?: string;
  governanceFilters: GovernanceFilters;
};

async function PendingProposals({
  proposalType,
  connectedAddress,
  connectedSpaceId,
  governanceFilters,
}: PendingProposalsProps) {
  const { node, hasMore } = await PendingProposalsPage({
    connectedSpaceId,
    connectedAddress,
    proposalType,
    page: 0,
    governanceFilters,
  });

  if (!node) {
    return <NoActivity />;
  }

  return (
    <>
      {node}
      {hasMore && connectedSpaceId && (
        <HomeProposalsInfiniteScroll
          connectedSpaceId={connectedSpaceId}
          connectedAddress={connectedAddress}
          proposalType={proposalType}
          governanceFilters={governanceFilters}
          page={0}
          initialHasMore={hasMore}
        />
      )}
    </>
  );
}
