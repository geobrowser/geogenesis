import { getGlobalRankingOgCardData, getRankingOgCardData } from '~/core/blocks/ranking/ranking-og-data';
import { generateRankingOgImageResponse } from '~/core/blocks/ranking/ranking-og-image';
import {
  RANKING_OG_IMAGE_CONTENT_TYPE,
  type RankingOgVariant,
  buildGlobalRankingOgObjectKey,
  buildRankingOgObjectKey,
  buildRankingOgPublicUrl,
  getRankingOgPublicBaseUrl,
} from '~/core/blocks/ranking/ranking-og-storage';

import { checkRankingOgIpRateLimit, getClientIp } from '../rate-limit';
import { isSafeOgVersion, isValidEntityId, jsonResponse, parseVariant } from '../route-utils';

export const runtime = 'nodejs';

// R2 objects are content-addressed by ogVersion, so a hit can be cached forever.
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const FALLBACK_CACHE = 'public, max-age=300, s-maxage=300';

function withCacheControl(response: Response, cacheControl: string): Response {
  response.headers.set('Cache-Control', cacheControl);
  return response;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') === 'global' ? 'global' : 'personal';
  const variant: RankingOgVariant = parseVariant(url.searchParams.get('variant')) ?? 'landscape';
  const blockEntityId = url.searchParams.get('blockEntityId') ?? '';
  const blockEntitySpaceId = url.searchParams.get('blockEntitySpaceId') ?? '';
  const rankingStartDate = url.searchParams.get('rankingStartDate') ?? '';
  const rankingEndDate = url.searchParams.get('rankingEndDate') ?? '';

  if (!isValidEntityId(blockEntityId) || !isValidEntityId(blockEntitySpaceId)) {
    return jsonResponse(400, { ok: false, error: 'invalid_input' });
  }

  const rankEntityId = url.searchParams.get('rankEntityId') ?? '';
  const authorSpaceId = url.searchParams.get('authorSpaceId') ?? '';

  if (scope === 'personal' && (!isValidEntityId(rankEntityId) || !isValidEntityId(authorSpaceId))) {
    return jsonResponse(400, { ok: false, error: 'invalid_input' });
  }

  // 1) Serve the cached R2 object when it's already been generated.
  const publicBaseUrl = getRankingOgPublicBaseUrl();
  if (publicBaseUrl) {
    const version =
      scope === 'global' ? (url.searchParams.get('globalOgVersion') ?? '') : (url.searchParams.get('ogVersion') ?? '');
    if (version && isSafeOgVersion(version)) {
      const key =
        scope === 'global'
          ? buildGlobalRankingOgObjectKey({ blockEntityId, version, variant })
          : buildRankingOgObjectKey({ rankEntityId, version, variant });
      const r2Response = await fetch(buildRankingOgPublicUrl(publicBaseUrl, key));
      if (r2Response.ok) {
        return new Response(await r2Response.arrayBuffer(), {
          headers: {
            'Content-Type': r2Response.headers.get('content-type') ?? RANKING_OG_IMAGE_CONTENT_TYPE,
            'Cache-Control': IMMUTABLE_CACHE,
          },
        });
      }
    }
  }

  // 2) Render on-demand: closes the publish -> R2-ready gap (and covers the
  // storage-not-configured case). This is the CPU-heavy public path, so it's
  // rate-limited per IP.
  const rateLimit = await checkRankingOgIpRateLimit(getClientIp(req));
  if (!rateLimit.ok) {
    return jsonResponse(429, { ok: false, error: 'rate_limited', retryAfter: rateLimit.retryAfter });
  }

  if (scope === 'global') {
    const data = await getGlobalRankingOgCardData({
      blockEntityId,
      blockEntitySpaceId,
      rankingStartDate,
      rankingEndDate,
    });
    if (!data) return jsonResponse(404, { ok: false, error: 'not_found' });
    return withCacheControl(generateRankingOgImageResponse(data, variant), FALLBACK_CACHE);
  }

  const data = await getRankingOgCardData({
    rankEntityId,
    authorSpaceId,
    blockEntityId,
    blockEntitySpaceId,
    rankingStartDate,
    rankingEndDate,
  });
  if (!data) return jsonResponse(404, { ok: false, error: 'not_found' });
  return withCacheControl(generateRankingOgImageResponse(data, variant), FALLBACK_CACHE);
}
