import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { DebugAvailabilityPageClient } from './debug-availability-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebugAvailabilityPage({ params }: Props) {
  const { id } = await params;

  if (!IdUtils.isValid(id)) notFound();

  return <DebugAvailabilityPageClient />;
}
