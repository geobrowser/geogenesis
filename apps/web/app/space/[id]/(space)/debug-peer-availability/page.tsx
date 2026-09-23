import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { DebugPeerAvailabilityPageClient } from './debug-peer-availability-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebugPeerAvailabilityPage({ params }: Props) {
  const { id } = await params;

  if (!IdUtils.isValid(id)) notFound();

  return <DebugPeerAvailabilityPageClient spaceId={id} />;
}
