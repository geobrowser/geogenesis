import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { DebateRoomPageClient } from './debate-room-page-client';

interface Props {
  params: Promise<{ id: string; debateId: string }>;
}

export default async function DebateRoomPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.debateId)) {
    notFound();
  }

  return <DebateRoomPageClient spaceId={params.id} debateId={params.debateId} />;
}
