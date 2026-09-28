import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { ID } from '~/core/id';
import { isHiddenEntity } from '~/core/moderation/hidden';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import DefaultEntityPage from './default-entity-page';

export type EntityRecordPageProps = {
  params: Promise<{ id: string; entityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** Shared server guard and page shell for type-owned record tab routes. */
export async function EntityRecordPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
  requiredTypeId,
}: EntityRecordPageProps & { requiredTypeId: string }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.entityId)) notFound();

  const result = await cachedFetchEntityPage(params.entityId, params.id);
  if (isHiddenEntity(result?.entity) || !result?.entity?.types.some(type => ID.equals(type.id, requiredTypeId))) {
    notFound();
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
