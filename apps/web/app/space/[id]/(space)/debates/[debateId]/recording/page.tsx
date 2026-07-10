import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { PublicDebateRecordingClient } from './recording-page-client';

interface Props {
  params: Promise<{ id: string; debateId: string }>;
}

export default async function PublicDebateRecordingPage({ params }: Props) {
  const { id, debateId } = await params;
  if (!IdUtils.isValid(id) || !IdUtils.isValid(debateId)) notFound();

  return <PublicDebateRecordingClient debateId={debateId} />;
}
