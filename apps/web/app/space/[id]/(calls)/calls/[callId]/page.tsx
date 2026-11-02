import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { SpaceCallPage } from '~/core/space-calls/space-call-page';

interface Props {
  params: Promise<{ id: string; callId: string }>;
}

/**
 * A space call (GEO-3419), full screen and outside the space layout. Access is decided client-side,
 * as for a lobby: geo-chat authenticates with a Privy token the server cannot see.
 */
export default async function SpaceCallRoute({ params }: Props) {
  const { id, callId } = await params;
  if (!IdUtils.isValid(id) || !IdUtils.isValid(callId)) notFound();

  return <SpaceCallPage spaceId={id} callId={callId} />;
}
