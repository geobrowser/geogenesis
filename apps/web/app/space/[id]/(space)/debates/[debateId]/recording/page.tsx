import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound, redirect } from 'next/navigation';

import { publishedDebatePath } from '~/core/debates/server/published-debate-path';

import { PublicDebateRecordingClient } from './recording-page-client';

interface Props {
  params: Promise<{ id: string; debateId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PublicDebateRecordingPage({ params, searchParams }: Props) {
  const { id, debateId } = await params;
  if (!IdUtils.isValid(id) || !IdUtils.isValid(debateId)) notFound();

  // Once the debate is on the graph, its own page replaces this bare viewer, on the server so the
  // recording never flashes first (GEO-3435). Until then this page plays it, as before.
  const debatePage = await publishedDebatePath(id, debateId, await searchParams);
  if (debatePage) redirect(debatePage);

  return <PublicDebateRecordingClient debateId={debateId} />;
}
