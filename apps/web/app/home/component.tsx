import * as React from 'react';

import { SidebarCounts } from '~/core/io/fetch-sidebar-counts';

import { Skeleton } from '~/design-system/skeleton';
import { TabGroup } from '~/design-system/tab-group';

import { HomeProposalsInfiniteScroll } from './home-proposals-infinite-scroll';
import { PendingProposalsPage } from './pending-proposals-page';
import { PersonalHomeDashboard } from './personal-home-dashboard';

const TABS = ['For You', 'Unpublished', 'Published', 'Following', 'Activity'] as const;

type Props = {
  header: React.ReactNode;
  sidebarCounts?: SidebarCounts;
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
  connectedSpaceId?: string;
};

export async function Component({ header, sidebarCounts, proposalType, connectedAddress, connectedSpaceId }: Props) {
  return (
    <>
      <div className="mx-auto max-w-[880px]">
        {header}
        <PersonalHomeNavigation />
        <PersonalHomeDashboard
          proposalsList={
            <React.Suspense
              key={`${proposalType}-${connectedAddress}`}
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
              />
            </React.Suspense>
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

function PersonalHomeNavigation() {
  return (
    <React.Suspense fallback={null}>
      <TabGroup
        tabs={TABS.map(label => {
          const href = label === 'For You' ? `/home` : `/home/${label.toLowerCase()}`;
          const disabled = label === 'For You' ? false : true;

          return {
            href,
            label,
            disabled,
          };
        })}
        className="mt-8"
      />
    </React.Suspense>
  );
}

type PendingProposalsProps = {
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
  connectedSpaceId?: string;
};

async function PendingProposals({ proposalType, connectedAddress, connectedSpaceId }: PendingProposalsProps) {
  const { node, hasMore } = await PendingProposalsPage({
    connectedSpaceId,
    connectedAddress,
    proposalType,
    page: 0,
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
          page={0}
          initialHasMore={hasMore}
        />
      )}
    </>
  );
}
