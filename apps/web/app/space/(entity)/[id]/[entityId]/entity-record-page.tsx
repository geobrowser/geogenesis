import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

import { ID } from '~/core/id';
import { isHiddenEntity } from '~/core/moderation/hidden';
import { QuerySeed, type QuerySeedEntry } from '~/core/query-seed';
import type { Entity } from '~/core/types';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import DefaultEntityPage from './default-entity-page';

export type EntityRecordSeed = (entity: Entity, spaceId: string) => Promise<QuerySeedEntry[]>;

export type EntityRecordPageProps = {
  params: Promise<{ id: string; entityId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** Shared server guard and page shell for type-owned record tab routes. */
export async function EntityRecordPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
  requiredTypeId,
  seed,
}: EntityRecordPageProps & {
  requiredTypeId: string;
  /**
   * What this tab would otherwise fetch on the client, fetched here instead so the list is in the
   * server HTML. A failed seed is dropped: the tab fetches for itself, exactly as it did before.
   */
  seed?: EntityRecordSeed;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;

  if (!IdUtils.isValid(params.id) || !IdUtils.isValid(params.entityId)) notFound();

  const result = await cachedFetchEntityPage(params.entityId, params.id);
  if (isHiddenEntity(result?.entity) || !result?.entity?.types.some(type => ID.equals(type.id, requiredTypeId))) {
    notFound();
  }

  const entries = await seed?.(result.entity, params.id).catch(() => []);
  const page = <DefaultEntityPage params={params} searchParams={searchParams} />;

  return entries && entries.length > 0 ? <QuerySeed entries={entries}>{page}</QuerySeed> : page;
}
