import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { TOPIC_TYPE_ID } from '~/core/constants';
import { ID } from '~/core/id';
import { isHiddenEntity } from '~/core/moderation/hidden';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import DefaultEntityPage from './default-entity-page';

export type TopicRecordPageProps = {
  params: Promise<{ id: string; entityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** Shared server guard and page shell for the topic's product-owned tab routes. */
export async function TopicRecordPage(props: TopicRecordPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.entityId)) notFound();

  const result = await cachedFetchEntityPage(params.entityId, params.id);
  if (isHiddenEntity(result?.entity) || !result?.entity?.types.some(type => ID.equals(type.id, TOPIC_TYPE_ID))) {
    notFound();
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
