import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { DebateRoomPageClient } from './room-page-client';

interface Props {
  params: Promise<{ roomId: string }>;
}

/**
 * A debate room (GEO-2941). Access is decided client-side — geo-chat authenticates with a Privy
 * token the server cannot see — so `notFound` covers only a roomId that is not an id.
 */
export default async function DebateRoomPage({ params }: Props) {
  const { roomId } = await params;
  if (!IdUtils.isValid(roomId)) notFound();

  return <DebateRoomPageClient roomId={roomId} />;
}
