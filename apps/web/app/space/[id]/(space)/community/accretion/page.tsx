import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { notFound } from 'next/navigation';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { ROOT_SPACE } from '~/core/constants';

import { AccretionDashboard } from '~/partials/community-tab/accretion-dashboard';
import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';
import { RootExploreSidePanelContainer } from '~/partials/explore/root-explore-side-panel-container';
import { SpaceOverviewSidePanel } from '~/partials/space-page/space-overview-side-panel';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AccretionDashboardPage({ params }: Props) {
  const { id: spaceId } = await params;
  if (!IdUtils.isValid(spaceId)) notFound();

  const sidebar =
    spaceId === ROOT_SPACE ? (
      <React.Suspense fallback={null}>
        <RootExploreSidePanelContainer />
      </React.Suspense>
    ) : (
      <SpaceOverviewSidePanel spaceId={spaceId} communityCalls={await fetchCommunityCalls(spaceId).catch(() => [])} />
    );

  return (
    <EntityPageSidebarLayout sidebar={sidebar}>
      <AccretionDashboard spaceId={spaceId} initialScope={spaceId === ROOT_SPACE ? 'protocol' : 'space'} />
    </EntityPageSidebarLayout>
  );
}
