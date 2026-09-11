import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { notFound } from 'next/navigation';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { ROOT_SPACE } from '~/core/constants';

import { CommunityTabPage } from '~/partials/community-tab/community-tab-page';
import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';
import { RootExploreSidePanelContainer } from '~/partials/explore/root-explore-side-panel-container';
import { SpaceOverviewSidePanel } from '~/partials/space-page/space-overview-side-panel';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CommunityPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const spaceId = params.id;

  // Root Community mirrors Overview: same Explore rail. Other spaces show calls only.
  const sidebar =
    spaceId === ROOT_SPACE ? (
      <React.Suspense fallback={null}>
        {/*
          No subspaces here, deliberately: they are an Overview section (GEO-2875) and Community is
          a tab. Stated rather than left off so the omission reads as a decision on the page rather
          than a default someone has to go and look up.
        */}
        <RootExploreSidePanelContainer spaceId={spaceId} includeSubspaces={false} />
      </React.Suspense>
    ) : (
      <SpaceOverviewSidePanel spaceId={spaceId} communityCalls={await fetchCommunityCalls(spaceId).catch(() => [])} />
    );

  return (
    <EntityPageSidebarLayout sidebar={sidebar}>
      <CommunityTabPage spaceId={spaceId} />
    </EntityPageSidebarLayout>
  );
}
