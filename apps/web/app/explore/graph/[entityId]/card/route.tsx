import { generateGraphCardResponse } from '~/core/graph-explorer/graph-card-image';
import { parseGraphRouteIds } from '~/core/graph-explorer/graph-card-metadata';
import { CARD_CACHE, DEGRADED_CACHE, loadGraphCardData } from '~/core/graph-explorer/server/graph-card-data';

import { checkRankingOgIpRateLimit, getClientIp } from '~/app/api/ranking-og/rate-limit';
import { jsonResponse } from '~/app/api/ranking-og/route-utils';

export const runtime = 'nodejs';

/**
 * The share card for `/explore/graph/{id}?topic&space`. Kept outside /api/, which robots.txt
 * disallows: X shows no image it may not fetch. `v` only busts caches.
 */
export async function GET(req: Request, { params }: { params: Promise<{ entityId: string }> }): Promise<Response> {
  const rateLimit = await checkRankingOgIpRateLimit(getClientIp(req));
  if (!rateLimit.ok) return jsonResponse(429, { ok: false, error: 'rate_limited', retryAfter: rateLimit.retryAfter });

  const { entityId } = await params;
  const search = new URL(req.url).searchParams;
  const ids = parseGraphRouteIds(entityId, { topic: search.get('topic'), space: search.get('space') });
  if (!ids || !ids.topicId) return jsonResponse(400, { ok: false, error: 'invalid_id' });
  if (search.get('space') && !ids.spaceId) return jsonResponse(400, { ok: false, error: 'invalid_id' });

  try {
    const data = await loadGraphCardData({ entityId: ids.entityId, topicId: ids.topicId, spaceId: ids.spaceId });
    if (!data) {
      const notFound = jsonResponse(404, { ok: false, error: 'not_found' });
      notFound.headers.set('Cache-Control', DEGRADED_CACHE);
      return notFound;
    }
    const image = await generateGraphCardResponse(data);
    image.headers.set('Cache-Control', data.degraded ? DEGRADED_CACHE : CARD_CACHE);
    return image;
  } catch (error) {
    console.error('Graph card failed', error);
    return jsonResponse(502, { ok: false, error: 'card_unavailable' });
  }
}
