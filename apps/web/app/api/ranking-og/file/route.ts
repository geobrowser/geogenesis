import {
  RANKING_OG_IMAGE_CONTENT_TYPE,
  buildRankingOgObjectKey,
  buildRankingOgPublicUrl,
  getRankingOgPublicBaseUrl,
} from '~/core/blocks/ranking/ranking-og-storage';

import { isSafeOgVersion, isValidEntityId, jsonResponse, parseVariant } from '../route-utils';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rankEntityId = url.searchParams.get('rankEntityId') ?? '';
  const ogVersion = url.searchParams.get('ogVersion') ?? '';
  const variant = parseVariant(url.searchParams.get('variant'));
  const publicBaseUrl = getRankingOgPublicBaseUrl();

  if (!publicBaseUrl) return jsonResponse(404, { ok: false, error: 'not_configured' });
  if (!isValidEntityId(rankEntityId) || !isSafeOgVersion(ogVersion) || !variant) {
    return jsonResponse(400, { ok: false, error: 'invalid_input' });
  }

  const key = buildRankingOgObjectKey({ rankEntityId, version: ogVersion, variant });
  const imageUrl = buildRankingOgPublicUrl(publicBaseUrl, key);
  const response = await fetch(imageUrl);
  if (!response.ok) return jsonResponse(response.status === 404 ? 404 : 502, { ok: false, error: 'image_unavailable' });

  return new Response(await response.arrayBuffer(), {
    headers: {
      'Content-Type': response.headers.get('content-type') ?? RANKING_OG_IMAGE_CONTENT_TYPE,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
