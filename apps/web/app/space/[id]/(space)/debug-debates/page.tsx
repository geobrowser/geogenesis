import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { DebugDebatesPageClient } from './debug-debates-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DebugDebatesPage({ params }: Props) {
  const { id } = await params;

  if (!IdUtils.isValid(id)) notFound();

  return <DebugDebatesPageClient spaceId={id} />;
}
