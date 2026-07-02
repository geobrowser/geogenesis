import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { QuestionsPageClient } from './questions-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QuestionsPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return <QuestionsPageClient spaceId={params.id} />;
}
