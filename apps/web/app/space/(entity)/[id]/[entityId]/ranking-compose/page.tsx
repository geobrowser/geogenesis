import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { type RankingComposeMode, rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import {
  RANKING_OG_VARIANT_SIZES,
  buildGlobalRankingOgObjectKey,
  buildRankingOgObjectKey,
  buildRankingOgPublicUrl,
  getRankingOgPublicBaseUrl,
} from '~/core/blocks/ranking/ranking-og-storage';

import { cachedFetchEntity } from '../cached-fetch-entity';
import { RankingComposeClientPage } from './ranking-compose-client-page';

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

  const publicBaseUrl = getRankingOgPublicBaseUrl();

  const siteUrl = new URL(process.env.ENV_URL ?? 'https://geobrowser.io');

  if (!publicBaseUrl) {
    return {};
  }

  const ranking =
    IdUtils.isValid(entityId) && IdUtils.isValid(spaceId) ? await cachedFetchEntity(entityId, spaceId) : null;

  const rankingName = ranking?.name?.trim() || 'ranking';

  if (hasValidPersonalRankingOgParams({ rankEntityId, authorSpaceId, ogVersion })) {
    const title = `My ${rankingName}`;

    const imageKey = buildRankingOgObjectKey({ rankEntityId, version: ogVersion, variant: 'landscape' });

    const imageUrl = buildRankingOgPublicUrl(publicBaseUrl, imageKey);

    const url = rankingComposeHref({
      spaceId,

      blockEntityId: entityId,

      relationId: stringParam(resolvedSearchParams, 'relationId'),

      parentEntityId: stringParam(resolvedSearchParams, 'parentEntityId'),

      rankingStartDate: stringParam(resolvedSearchParams, 'rankingStartDate'),

      rankingEndDate: stringParam(resolvedSearchParams, 'rankingEndDate'),

      mode: 'view',

      rankEntityId,

      authorSpaceId,

      ogVersion,
    });

    return {
      title,

      description: `A personal Geo ranking for ${rankingName}.`,

      openGraph: {
        title,

        description: `A personal Geo ranking for ${rankingName}.`,

        url: new URL(url, siteUrl).toString(),

        images: [
          {
            url: imageUrl,

            ...RANKING_OG_VARIANT_SIZES.landscape,

            alt: title,
          },
        ],
      },

      twitter: {
        card: 'summary_large_image',

        title,

        description: `A personal Geo ranking for ${rankingName}.`,

        images: [imageUrl],
      },
    };
  }

  if (hasValidGlobalRankingOgParams({ blockEntityId: entityId, globalOgVersion })) {
    const title = rankingName;

    const imageKey = buildGlobalRankingOgObjectKey({
      blockEntityId: entityId,

      version: globalOgVersion,

      variant: 'landscape',
    });

    const imageUrl = buildRankingOgPublicUrl(publicBaseUrl, imageKey);

    const url = rankingComposeHref({
      spaceId,

      blockEntityId: entityId,

      relationId: stringParam(resolvedSearchParams, 'relationId'),

      parentEntityId: stringParam(resolvedSearchParams, 'parentEntityId'),

      rankingStartDate: stringParam(resolvedSearchParams, 'rankingStartDate'),

      rankingEndDate: stringParam(resolvedSearchParams, 'rankingEndDate'),

      mode: 'view',

      globalOgVersion,
    });

    return {
      title,

      description: `Vote on the global Geo ranking for ${rankingName}.`,

      openGraph: {
        title,

        description: `Vote on the global Geo ranking for ${rankingName}.`,

        url: new URL(url, siteUrl).toString(),

        images: [
          {
            url: imageUrl,

            ...RANKING_OG_VARIANT_SIZES.landscape,

            alt: title,
          },
        ],
      },

      twitter: {
        card: 'summary_large_image',

        title,

        description: `Vote on the global Geo ranking for ${rankingName}.`,

        images: [imageUrl],
      },
    };
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
      globalOgVersion={stringParam(resolvedSearchParams, 'globalOgVersion')}
    />
  );
}
