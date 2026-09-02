import * as React from 'react';

import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { cachedFetchProfile } from '~/core/io/subgraph';

import {
  type GovernanceFilters,
  type GovernanceTab,
  parseCategory,
  parseGovernanceTab,
  parseSpace,
  parseStatus,
} from './governance-home-filter-params';
import { getGovernanceHomeSpaceContext } from './governance-home-space-ids';
import { HomeProposalsInfiniteScroll } from './home-proposals-infinite-scroll';
import { LoadingSkeleton } from './loading-skeleton';
import { MyGovernanceProposalsList } from './my-governance-proposals-list';
import { PendingProposalsPage } from './pending-proposals-page';
import { PersonalHomeDashboard } from './personal-home-dashboard';

interface Props {
  searchParams: Promise<{
    proposalType?: 'membership' | 'content';
    tab?: string;
    proposalCategory?: string;
    proposalStatus?: string;
    space?: string;
  }>;
}

export default async function PersonalHomePage(props: Props) {
  const [cookieStore, sp] = await Promise.all([cookies(), props.searchParams]);
  const connectedAddress = cookieStore.get(WALLET_ADDRESS)?.value;

  const tab = parseGovernanceTab(sp.tab);
  const governanceFilters: GovernanceFilters = {
    spaceId: parseSpace(sp.space),
    category: parseCategory(sp.proposalCategory, sp.proposalType),
    status: parseStatus(sp.proposalStatus),
  };

  const person = connectedAddress ? await cachedFetchProfile(connectedAddress) : null;
  const connectedSpaceId = person?.spaceId;

  const list = await renderList({
    tab,
    connectedAddress,
    connectedSpaceId,
    proposalType: sp.proposalType,
    governanceFilters,
  });

  return (
    <PersonalHomeDashboard governanceTab={tab} governanceFilters={governanceFilters}>
      {list}
    </PersonalHomeDashboard>
  );
}

async function renderList({
  tab,
  connectedAddress,
  connectedSpaceId,
  proposalType,
  governanceFilters,
}: {
  tab: GovernanceTab;
  connectedAddress?: string;
  connectedSpaceId?: string;
  proposalType?: 'membership' | 'content';
  governanceFilters: GovernanceFilters;
}) {
  if (tab === 'my') {
    if (!connectedSpaceId) {
      return <p className="text-body text-grey-04">Sign in to see your proposals.</p>;
    }

    const ctx = await getGovernanceHomeSpaceContext(connectedSpaceId);

    return (
      <React.Suspense fallback={<ListSkeleton count={2} />}>
        <MyGovernanceProposalsList
          memberSpaceId={connectedSpaceId}
          viewerWalletAddress={connectedAddress}
          spaceIds={ctx.myProposalSpaceIds}
          spaceFilter={governanceFilters.spaceId}
          category={governanceFilters.category}
          status={governanceFilters.status}
          governanceTab={tab}
          proposalType={proposalType}
        />
      </React.Suspense>
    );
  }

  return (
    <React.Suspense fallback={<ListSkeleton count={3} />}>
      <PendingProposals
        connectedAddress={connectedAddress}
        connectedSpaceId={connectedSpaceId}
        proposalType={proposalType}
        governanceFilters={governanceFilters}
      />
    </React.Suspense>
  );
}

function ListSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <LoadingSkeleton key={i} />
      ))}
    </div>
  );
}

function NoActivity({ status }: { status: GovernanceFilters['status'] }) {
  if (status === 'pending') {
    return <p className="mb-4 text-body text-grey-04">You have no pending requests or proposals.</p>;
  }
  if (status === 'accepted') {
    return <p className="mb-4 text-body text-grey-04">You have no accepted requests or proposals.</p>;
  }
  return <p className="mb-4 text-body text-grey-04">You have no rejected requests or proposals.</p>;
}

async function PendingProposals({
  proposalType,
  connectedAddress,
  connectedSpaceId,
  governanceFilters,
}: {
  proposalType?: 'membership' | 'content';
  connectedAddress?: string;
  connectedSpaceId?: string;
  governanceFilters: GovernanceFilters;
}) {
  const { node, hasMore } = await PendingProposalsPage({
    connectedSpaceId,
    connectedAddress,
    proposalType,
    page: 0,
    governanceFilters,
  });

  if (!node) {
    return <NoActivity status={governanceFilters.status} />;
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
