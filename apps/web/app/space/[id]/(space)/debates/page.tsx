import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';

import { cachedFetchSpace } from '../../cached-fetch-space';
import { DebatesPageClient } from './debates-page-client';
import { PersonDebatesPageClient } from './person-debates-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebatesPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);
  const isPersonSpace = space?.entity?.types?.some(type => type.id === SystemIds.PERSON_TYPE) ?? false;

  if (isPersonSpace) {
    return (
      <EntityPageContentContainer>
        <PersonDebatesPageClient personId={params.id} />
      </EntityPageContentContainer>
    );
  }

  // Full-bleed: no content-width container. The feed fills the viewport itself.
  return <DebatesPageClient spaceId={params.id} />;
}
