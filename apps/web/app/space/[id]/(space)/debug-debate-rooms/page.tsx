import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { DebugDebateRoomsPageClient } from './debug-debate-rooms-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Books a scheduled debate so a room exists to open (GEO-2941). Rooms are only created by accepting
 * one, and the scheduling UI that would is unbuilt.
 */
export default async function DebugDebateRoomsPage({ params }: Props) {
  const { id } = await params;

  if (!IdUtils.isValid(id)) notFound();

  return <DebugDebateRoomsPageClient />;
}
