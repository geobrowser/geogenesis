import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { notFound } from 'next/navigation';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { ROOT_SPACE } from '~/core/constants';
import { SIDE_RAIL_FETCH_TIMEOUT_MS, withTimeout } from '~/core/utils/with-timeout';

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
      <SpaceOverviewSidePanel
        spaceId={spaceId}
        // Bounded like the layout's copy. `fetchCommunityCalls` is `cache()`d, so this awaits the
        // *same promise* the layout started — and a memoised promise that never settles is not made
        // safe by the layout having given up on it.
        communityCalls={await withTimeout(
          fetchCommunityCalls(spaceId).catch(() => []),
          SIDE_RAIL_FETCH_TIMEOUT_MS,
          []
        )}
      />
    );

  return (
    <EntityPageSidebarLayout sidebar={sidebar}>
      <CommunityTabPage spaceId={spaceId} />
    </EntityPageSidebarLayout>
  );
}
