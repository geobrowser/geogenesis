import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { PersonProposalsTab } from '~/partials/profile/person-proposals-tab';

import { cachedFetchSpace } from '../../cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Everything this person proposed, across every space (GEO-2859).
 *
 * Only on a personal space. A DAO space's own proposals are the governance tab's
 * job, and that one is scoped to the space — this one deliberately is not.
 */
export default async function ProposalsPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);

  if (space?.type !== 'PERSONAL') {
    notFound();
  }

  return (
    <EntityPageContentContainer>
      <PersonProposalsTab spaceId={params.id} />
    </EntityPageContentContainer>
  );
}
