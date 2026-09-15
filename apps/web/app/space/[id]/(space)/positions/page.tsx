import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { PersonPositionsTab } from '~/partials/profile/person-positions-tab';

import { cachedFetchSpace } from '../../cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * The claims this person holds a position on (GEO-2859).
 *
 * A person's record, not a space's, so it only exists on a personal space — a
 * DAO space has no votes of its own to show here.
 */
export default async function PositionsPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);

  if (space?.type !== 'PERSONAL') {
    notFound();
  }

  return <PersonPositionsTab spaceId={params.id} />;
}
