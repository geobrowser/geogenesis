import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { PersonDebateFeed } from '~/core/debates/browse/person-debate-feed';

import { cachedFetchSpace } from '../../cached-fetch-space';
import { DebatesPageClient } from './debates-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebatesPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  const space = await cachedFetchSpace(params.id);

  // A personal space gets its owner's debates rather than the space's own, which
  // geo-chat cannot answer for: it indexes DAO spaces only. Same feed, different
  // list — see `usePersonDebates`.
  if (space?.type === 'PERSONAL') {
    return <PersonDebateFeed spaceId={params.id} />;
  }

  // Full-bleed: no content-width container. The feed fills the viewport itself.
  return <DebatesPageClient spaceId={params.id} />;
}
