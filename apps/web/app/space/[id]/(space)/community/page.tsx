import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';

import { SpaceCommunityCallsSection } from '~/partials/community-calls/space-community-calls-section';
import { CommunityTabPage } from '~/partials/community-tab/community-tab-page';
import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CommunityPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const spaceId = params.id;
  const communityCalls = await fetchCommunityCalls(spaceId).catch(() => []);

  return (
    <EntityPageSidebarLayout
      sidebar={
        communityCalls.length > 0 ? <SpaceCommunityCallsSection spaceId={spaceId} series={communityCalls} /> : null
      }
    >
      <CommunityTabPage spaceId={spaceId} />
    </EntityPageSidebarLayout>
  );
}
