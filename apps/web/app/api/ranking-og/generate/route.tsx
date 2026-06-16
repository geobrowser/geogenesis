import { getGlobalRankingOgCardData, getRankingOgCardData } from '~/core/blocks/ranking/ranking-og-data';
import { generateRankingOgImageResponse } from '~/core/blocks/ranking/ranking-og-image';
import { buildRankingOgPreviewUrl } from '~/core/blocks/ranking/ranking-og-preview-url';
import {
  RankingOgStorageConfigError,
  type RankingOgVariant,
  buildGlobalRankingOgObjectKey,
  buildRankingOgObjectKey,
  buildRankingOgPublicUrl,
  getRankingOgStorageConfig,
  isRankingOgStorageConfigured,
  putGlobalRankingOgObject,
  putRankingOgObject,
  rankingOgObjectExists,
} from '~/core/blocks/ranking/ranking-og-storage';

import {
  hasRankingOgAdminSecret,
  isSafeOgVersion,
  isSameOrigin,
  isValidEntityId,
  jsonResponse,
  parseVariants,
} from '../route-utils';

export const runtime = 'nodejs';

type GenerateBody = {
  scope?: unknown;
  rankEntityId?: unknown;
  authorSpaceId?: unknown;
  blockEntityId?: unknown;
  blockEntitySpaceId?: unknown;
  rankingStartDate?: unknown;
  rankingEndDate?: unknown;
  ogVersion?: unknown;
  globalOgVersion?: unknown;
  variants?: unknown;
};

async function imageResponseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

function stringField(body: GenerateBody, key: keyof GenerateBody): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function generateScope(body: GenerateBody): 'global' | 'personal' {
  const scope = stringField(body, 'scope');
  if (scope === 'global') return 'global';
  if (scope === 'personal') return 'personal';
  return stringField(body, 'globalOgVersion') && !stringField(body, 'rankEntityId') ? 'global' : 'personal';
}

function resolveRankingOgSiteOrigin(req: Request): string {
  const configured = process.env.ENV_URL?.trim();
  if (configured) return new URL(configured).origin;
  return new URL(req.url).origin;
}

function previewFallbackResponse({
  req,
  scope,
  body,
  variants,
}: {
  req: Request;
  scope: 'global' | 'personal';
  body: GenerateBody;
  variants: RankingOgVariant[];
}) {
  const siteOrigin = resolveRankingOgSiteOrigin(req);
  const blockEntityId = stringField(body, 'blockEntityId');
  const blockEntitySpaceId = stringField(body, 'blockEntitySpaceId');
  const rankingStartDate = stringField(body, 'rankingStartDate');
  const rankingEndDate = stringField(body, 'rankingEndDate');
  const previewParams =
    scope === 'global'
      ? {
          scope: 'global' as const,
          blockEntityId,
          blockEntitySpaceId,
          rankingStartDate,
          rankingEndDate,
          globalOgVersion: stringField(body, 'globalOgVersion'),
        }
      : {
          scope: 'personal' as const,
          rankEntityId: stringField(body, 'rankEntityId'),
          authorSpaceId: stringField(body, 'authorSpaceId'),
          blockEntityId,
          blockEntitySpaceId,
          rankingStartDate,
          rankingEndDate,
          ogVersion: stringField(body, 'ogVersion'),
        };

  const imageUrls = Object.fromEntries(
    variants.map(variant => [variant, buildRankingOgPreviewUrl(siteOrigin, previewParams, { variant })])
  );

  return jsonResponse(200, {
    ok: true,
    scope,
    storageConfigured: false,
    uploaded: false,
    imageUrls,
    keys: {},
  });
}

async function uploadPersonalVariant({
  variant,
  version,
  rankEntityId,
  data,
}: {
  variant: RankingOgVariant;
  version: string;
  rankEntityId: string;
  data: NonNullable<Awaited<ReturnType<typeof getRankingOgCardData>>>;
}) {
  const config = getRankingOgStorageConfig();
  const key = buildRankingOgObjectKey({ rankEntityId, version, variant });
  const imageUrl = buildRankingOgPublicUrl(config.publicBaseUrl, key);

  if (await rankingOgObjectExists(config, key)) {
    return { key, imageUrl, uploaded: false };
  }

  const image = generateRankingOgImageResponse(data, variant);
  const body = await imageResponseBytes(image);
  const uploaded = await putRankingOgObject(config, {
    rankEntityId,
    version,
    variant,
    body,
  });

  return { ...uploaded, uploaded: true };
}

async function uploadGlobalVariant({
  variant,
  version,
  blockEntityId,
  data,
}: {
  variant: RankingOgVariant;
  version: string;
  blockEntityId: string;
  data: NonNullable<Awaited<ReturnType<typeof getGlobalRankingOgCardData>>>;
}) {
  const config = getRankingOgStorageConfig();
  const key = buildGlobalRankingOgObjectKey({ blockEntityId, version, variant });
  const imageUrl = buildRankingOgPublicUrl(config.publicBaseUrl, key);

  if (await rankingOgObjectExists(config, key)) {
    return { key, imageUrl, uploaded: false };
  }

  const image = generateRankingOgImageResponse(data, variant);
  const body = await imageResponseBytes(image);
  const uploaded = await putGlobalRankingOgObject(config, {
    blockEntityId,
    version,
    variant,
    body,
  });

  return { ...uploaded, uploaded: true };
}

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req) && !hasRankingOgAdminSecret(req)) {
    return jsonResponse(403, { ok: false, error: 'forbidden' });
  }

  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_input' });
  }

  const blockEntityId = stringField(body, 'blockEntityId');
  const blockEntitySpaceId = stringField(body, 'blockEntitySpaceId');
  const variants = parseVariants(body.variants);
  const rankingStartDate = stringField(body, 'rankingStartDate');
  const rankingEndDate = stringField(body, 'rankingEndDate');
  const scope = generateScope(body);

  if (!isValidEntityId(blockEntityId) || !isValidEntityId(blockEntitySpaceId) || !variants) {
    return jsonResponse(400, { ok: false, error: 'invalid_input' });
  }

  try {
    if (scope === 'global') {
      const globalOgVersion = stringField(body, 'globalOgVersion');
      if (!isSafeOgVersion(globalOgVersion)) {
        return jsonResponse(400, { ok: false, error: 'invalid_input' });
      }

      const data = await getGlobalRankingOgCardData({
        blockEntityId,
        blockEntitySpaceId,
        rankingStartDate,
        rankingEndDate,
      });

      if (!data) {
        return jsonResponse(400, { ok: false, error: 'invalid_block' });
      }

      if (!isRankingOgStorageConfigured()) {
        return previewFallbackResponse({ req, scope, body, variants });
      }

      const results = await Promise.all(
        variants.map(variant =>
          uploadGlobalVariant({
            variant,
            version: globalOgVersion,
            blockEntityId,
            data,
          })
        )
      );
      const imageUrls = Object.fromEntries(results.map((result, index) => [variants[index], result.imageUrl]));
      const keys = Object.fromEntries(results.map((result, index) => [variants[index], result.key]));

      return jsonResponse(200, {
        ok: true,
        scope: 'global',
        storageConfigured: true,
        imageUrls,
        keys,
        uploaded: results.some(result => result.uploaded),
      });
    }

    const rankEntityId = stringField(body, 'rankEntityId');
    const authorSpaceId = stringField(body, 'authorSpaceId');
    const ogVersion = stringField(body, 'ogVersion');

    if (!isValidEntityId(rankEntityId) || !isValidEntityId(authorSpaceId) || !isSafeOgVersion(ogVersion)) {
      return jsonResponse(400, { ok: false, error: 'invalid_input' });
    }

    const data = await getRankingOgCardData({
      rankEntityId,
      authorSpaceId,
      blockEntityId,
      blockEntitySpaceId,
      rankingStartDate,
      rankingEndDate,
    });

    if (!data) {
      return jsonResponse(400, { ok: false, error: 'invalid_rank' });
    }

    if (!isRankingOgStorageConfigured()) {
      return previewFallbackResponse({ req, scope, body, variants });
    }

    const results = await Promise.all(
      variants.map(variant =>
        uploadPersonalVariant({
          variant,
          version: ogVersion,
          rankEntityId,
          data,
        })
      )
    );
    const imageUrls = Object.fromEntries(results.map((result, index) => [variants[index], result.imageUrl]));
    const keys = Object.fromEntries(results.map((result, index) => [variants[index], result.key]));

    return jsonResponse(200, {
      ok: true,
      scope: 'personal',
      storageConfigured: true,
      imageUrls,
      keys,
      uploaded: results.some(result => result.uploaded),
    });
  } catch (error) {
    if (error instanceof RankingOgStorageConfigError) {
      return previewFallbackResponse({ req, scope, body, variants: variants ?? ['landscape', 'story'] });
    }
    console.error('[ranking-og/generate] failed', error);
    return jsonResponse(500, { ok: false, error: 'generation_failed' });
  }
}
