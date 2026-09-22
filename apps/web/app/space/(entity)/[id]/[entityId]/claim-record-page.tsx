import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { isHiddenEntity } from '~/core/moderation/hidden';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import DefaultEntityPage from './default-entity-page';

export type ClaimRecordPageProps = {
  params: Promise<{ id: string; entityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** The shared server guard and page shell behind the claim's three record routes. */
export async function ClaimRecordPage(props: ClaimRecordPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.entityId)) notFound();

  const result = await cachedFetchEntityPage(params.entityId, params.id);
  if (isHiddenEntity(result?.entity) || !result?.entity?.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID))) {
    notFound();
  }

  return <DefaultEntityPage params={params} searchParams={searchParams} />;
}
