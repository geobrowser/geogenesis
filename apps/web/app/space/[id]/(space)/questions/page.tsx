import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';

import { QuestionsPageClient } from './questions-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QuestionsPage(props: Props) {
  const params = await props.params;

  if (!IdUtils.isValid(params.id)) {
    notFound();
  }

  return (
    <EntityPageContentContainer>
      <QuestionsPageClient spaceId={params.id} />
    </EntityPageContentContainer>
  );
}
