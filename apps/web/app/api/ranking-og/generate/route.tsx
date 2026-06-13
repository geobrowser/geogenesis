import { getRankingOgCardData } from '~/core/blocks/ranking/ranking-og-data';
import { generateRankingOgImageResponse } from '~/core/blocks/ranking/ranking-og-image';
import {
  RankingOgStorageConfigError,
  type RankingOgVariant,
  buildRankingOgObjectKey,
  buildRankingOgPublicUrl,
  getRankingOgStorageConfig,
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
  rankEntityId?: unknown;
  authorSpaceId?: unknown;
  blockEntityId?: unknown;
  blockEntitySpaceId?: unknown;
  rankingStartDate?: unknown;
  rankingEndDate?: unknown;
  ogVersion?: unknown;
  variants?: unknown;
};

async function imageResponseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

function stringField(body: GenerateBody, key: keyof GenerateBody): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

async function uploadVariant({
  variant,
  version,
  rankEntityId,
  data,
}: {
  variant: RankingOgVariant;
  version: string;
  rankEntityId: string;
  data: Awaited<ReturnType<typeof getRankingOgCardData>>;
}) {
  if (!data) throw new Error('missing card data');

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

  const rankEntityId = stringField(body, 'rankEntityId');
  const authorSpaceId = stringField(body, 'authorSpaceId');
  const blockEntityId = stringField(body, 'blockEntityId');
  const blockEntitySpaceId = stringField(body, 'blockEntitySpaceId');
  const ogVersion = stringField(body, 'ogVersion');
  const variants = parseVariants(body.variants);

  if (
    !isValidEntityId(rankEntityId) ||
    !isValidEntityId(authorSpaceId) ||
    !isValidEntityId(blockEntityId) ||
    !isValidEntityId(blockEntitySpaceId) ||
    !isSafeOgVersion(ogVersion) ||
    !variants
  ) {
    return jsonResponse(400, { ok: false, error: 'invalid_input' });
  }

  try {
    const data = await getRankingOgCardData({
      rankEntityId,
      authorSpaceId,
      blockEntityId,
      blockEntitySpaceId,
      rankingStartDate: stringField(body, 'rankingStartDate'),
      rankingEndDate: stringField(body, 'rankingEndDate'),
    });

    if (!data) {
      return jsonResponse(400, { ok: false, error: 'invalid_rank' });
    }

    const results = await Promise.all(
      variants.map(variant =>
        uploadVariant({
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
      imageUrls,
      keys,
      uploaded: results.some(result => result.uploaded),
    });
  } catch (error) {
    if (error instanceof RankingOgStorageConfigError) {
      return jsonResponse(500, { ok: false, error: 'storage_not_configured', message: error.message });
    }
    console.error('[ranking-og/generate] failed', error);
    return jsonResponse(500, { ok: false, error: 'generation_failed' });
  }
}
