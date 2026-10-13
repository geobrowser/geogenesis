import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { DebateRequestSurface } from '~/core/debates/debate-request-surface';

import { DebateRematchPageClient } from './rematch-page-client';

interface Props {
  params: Promise<{ id: string; sessionId: string }>;
}

export default async function DebateRematchPage({ params }: Props) {
  const { id, sessionId } = await params;
  if (!IdUtils.isValid(id) || !IdUtils.isValid(sessionId)) notFound();

  return (
    <DebateRequestSurface surface="rematch_page">
      <DebateRematchPageClient sessionId={sessionId} />
    </DebateRequestSurface>
  );
}
