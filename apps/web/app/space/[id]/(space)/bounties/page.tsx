import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { bountiesEnabledForNetwork } from '~/core/bounties/config';
import { isBountySpace } from '~/core/bounties/constants';

import { SpaceBountiesPageClient } from './space-bounties-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SpaceBountiesPage({ params }: Props) {
  const { id } = await params;

  if (!IdUtils.isValid(id)) notFound();
  // Hard gate: no bounties on this network / no backend, or a space outside the program.
  if (!bountiesEnabledForNetwork || !isBountySpace(id)) notFound();

  return <SpaceBountiesPageClient spaceId={id} />;
}
