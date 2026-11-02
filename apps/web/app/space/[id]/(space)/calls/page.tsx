import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { SpaceCallsTab } from '~/partials/space-calls/space-calls-tab';

interface Props {
  params: Promise<{ id: string }>;
}

/** A space's Calls tab (GEO-3420). Its reads are geo-chat's and run client-side. */
export default async function SpaceCalls(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return (
    <EntityPageContentContainer>
      <SpaceCallsTab spaceId={params.id} />
    </EntityPageContentContainer>
  );
}
