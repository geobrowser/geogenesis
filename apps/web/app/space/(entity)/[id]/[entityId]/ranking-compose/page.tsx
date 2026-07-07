import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { cache } from 'react';

import type { Metadata } from 'next';

import { Effect } from 'effect';

import { type RankingComposeMode, rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import {
  buildGlobalRankingMetadataFromParts,
  buildPersonalRankingMetadataFromParts,
  resolveGlobalRankingOgImageUrl,
  resolvePersonalRankingOgImageUrl,
} from '~/core/blocks/ranking/ranking-og-metadata';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';

import { cachedFetchEntity } from '../cached-fetch-entity';
import { RankingComposeClientPage } from './ranking-compose-client-page';

const cachedFetchProfileBySpaceId = cache(async (spaceId: string) => {
  try {
    return await Effect.runPromise(fetchProfileBySpaceId(spaceId));
  } catch {
    return null;
  }
});

type PageParams = {
  id: string;
  entityId: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  params: Promise<PageParams>;
  searchParams: Promise<SearchParams>;
};

function stringParam(searchParams: SearchParams, key: string): string {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function rankingMode(searchParams: SearchParams): RankingComposeMode {
  return stringParam(searchParams, 'mode') === 'view' ? 'view' : 'edit';
}

function isSafeOgVersion(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

function hasValidPersonalRankingOgParams({
  rankEntityId,
  authorSpaceId,
  ogVersion,
}: {
  rankEntityId: string;
  authorSpaceId: string;
  ogVersion: string;
}): boolean {
  return IdUtils.isValid(rankEntityId) && IdUtils.isValid(authorSpaceId) && isSafeOgVersion(ogVersion);
}
// test

function hasValidGlobalRankingOgParams({
  blockEntityId,
  globalOgVersion,
}: {
  blockEntityId: string;
  globalOgVersion: string;
}): boolean {
  return IdUtils.isValid(blockEntityId) && isSafeOgVersion(globalOgVersion);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id: spaceId, entityId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const rankEntityId = stringParam(resolvedSearchParams, 'rankEntityId');
  const authorSpaceId = stringParam(resolvedSearchParams, 'authorSpaceId');
  const ogVersion = stringParam(resolvedSearchParams, 'ogVersion');
  const globalOgVersion = stringParam(resolvedSearchParams, 'globalOgVersion');
  const rankingStartDate = stringParam(resolvedSearchParams, 'rankingStartDate');
  const rankingEndDate = stringParam(resolvedSearchParams, 'rankingEndDate');
  const siteUrl = new URL(process.env.ENV_URL ?? 'https://geobrowser.io');

  const ranking =
    IdUtils.isValid(entityId) && IdUtils.isValid(spaceId) ? await cachedFetchEntity(entityId, spaceId) : null;
  const rankingName = ranking?.name?.trim() || 'ranking';

  if (hasValidPersonalRankingOgParams({ rankEntityId, authorSpaceId, ogVersion })) {
    const authorProfile = await cachedFetchProfileBySpaceId(authorSpaceId);
    const authorName = authorProfile?.name?.trim() || '';
    const imageUrl = await resolvePersonalRankingOgImageUrl(siteUrl.toString(), {
      rankEntityId,
      authorSpaceId,
      blockEntityId: entityId,
      blockEntitySpaceId: spaceId,
      rankingStartDate,
      rankingEndDate,
      ogVersion,
    });
    const url = rankingComposeHref({
      spaceId,
      blockEntityId: entityId,
      relationId: stringParam(resolvedSearchParams, 'relationId'),
      parentEntityId: stringParam(resolvedSearchParams, 'parentEntityId'),
      rankingStartDate,
      rankingEndDate,
      mode: 'view',
      rankEntityId,
      authorSpaceId,
      ogVersion,
    });

    return buildPersonalRankingMetadataFromParts({
      rankingName,
      authorName,
      imageUrl,
      url: new URL(url, siteUrl).toString(),
    });
  }

  if (hasValidGlobalRankingOgParams({ blockEntityId: entityId, globalOgVersion })) {
    const imageUrl = await resolveGlobalRankingOgImageUrl(siteUrl.toString(), {
      blockEntityId: entityId,
      blockEntitySpaceId: spaceId,
      rankingStartDate,
      rankingEndDate,
      globalOgVersion,
    });
    const url = rankingComposeHref({
      spaceId,
      blockEntityId: entityId,
      relationId: stringParam(resolvedSearchParams, 'relationId'),
      parentEntityId: stringParam(resolvedSearchParams, 'parentEntityId'),
      rankingStartDate,
      rankingEndDate,
      mode: 'view',
      globalOgVersion,
    });

    return buildGlobalRankingMetadataFromParts({
      rankingName,
      imageUrl,
      url: new URL(url, siteUrl).toString(),
    });
  }

  return {};
}

export default async function RankingComposePage({ params, searchParams }: Props) {
  const [{ id: spaceId, entityId: dataBlockEntityId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  return (
    <RankingComposeClientPage
      spaceId={spaceId}
      dataBlockEntityId={dataBlockEntityId}
      relationId={stringParam(resolvedSearchParams, 'relationId')}
      parentEntityIdParam={stringParam(resolvedSearchParams, 'parentEntityId')}
      rankingStartDate={stringParam(resolvedSearchParams, 'rankingStartDate')}
      rankingEndDate={stringParam(resolvedSearchParams, 'rankingEndDate')}
      mode={rankingMode(resolvedSearchParams)}
      rankEntityId={stringParam(resolvedSearchParams, 'rankEntityId')}
      authorSpaceId={stringParam(resolvedSearchParams, 'authorSpaceId')}
      ogVersion={stringParam(resolvedSearchParams, 'ogVersion')}
    />
  );
}
