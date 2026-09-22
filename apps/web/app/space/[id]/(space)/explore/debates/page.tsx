import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { SpaceActivityExploreFeed } from '~/partials/space-page/space-activity-explore-feed';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SpaceExploreDebatesPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return (
    <EntityPageContentContainer>
      <SpaceActivityExploreFeed spaceId={params.id} kind="debates" />
    </EntityPageContentContainer>
  );
}
