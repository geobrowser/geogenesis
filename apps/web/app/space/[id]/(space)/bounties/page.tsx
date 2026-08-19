import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { bountiesEnabledForNetwork } from '~/core/bounties/config';

import { SpaceBountiesPageClient } from './space-bounties-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SpaceBountiesPage({ params }: Props) {
  const { id } = await params;

  if (!IdUtils.isValid(id)) notFound();
  // Hard gate: no bounties on this network / no backend. Any space may be
  // browsed (the Community tab lists bounties for every space); authoring
  // stays limited to participating spaces.
  if (!bountiesEnabledForNetwork) notFound();

  return <SpaceBountiesPageClient spaceId={id} />;
}
