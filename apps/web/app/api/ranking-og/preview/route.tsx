import { getGlobalRankingOgCardData, getRankingOgCardData } from '~/core/blocks/ranking/ranking-og-data';
import { generateRankingOgImageResponse } from '~/core/blocks/ranking/ranking-og-image';
import { startOgTimer } from '~/core/og-timing';

import { checkRankingOgIpRateLimit, getClientIp } from '../rate-limit';
import { isValidEntityId, jsonResponse, parseVariant } from '../route-utils';

export const runtime = 'nodejs';

// Attach the per-request Server-Timing breakdown to the image response so it's
// visible in devtools / `curl -D -` without reading server logs.
function withServerTiming(response: Response, serverTiming: string): Response {
  if (!serverTiming) return response;
  const headers = new Headers(response.headers);
  headers.set('Server-Timing', serverTiming);
  return new Response(response.body, { status: response.status, headers });
}

export async function GET(req: Request): Promise<Response> {
  const timer = startOgTimer('preview-route');

  // Public, unauthenticated renderer (OG fallback) — rate-limit per IP to bound
  // on-demand image-generation cost.
  const rateLimit = await checkRankingOgIpRateLimit(getClientIp(req));
  if (!rateLimit.ok) {
    return jsonResponse(429, { ok: false, error: 'rate_limited', retryAfter: rateLimit.retryAfter });
  }

  const url = new URL(req.url);
  const variant = parseVariant(url.searchParams.get('variant')) ?? 'landscape';
  const scope = url.searchParams.get('scope') === 'global' ? 'global' : 'personal';
  const blockEntityId = url.searchParams.get('blockEntityId') ?? '';
  const blockEntitySpaceId = url.searchParams.get('blockEntitySpaceId') ?? '';
  const rankingStartDate = url.searchParams.get('rankingStartDate') ?? '';
  const rankingEndDate = url.searchParams.get('rankingEndDate') ?? '';

  if (scope === 'global') {
    if (!isValidEntityId(blockEntityId) || !isValidEntityId(blockEntitySpaceId)) {
      return jsonResponse(400, { ok: false, error: 'invalid_input' });
    }

    const data = await timer.span('data', () =>
      getGlobalRankingOgCardData({
        blockEntityId,
        blockEntitySpaceId,
        rankingStartDate,
        rankingEndDate,
      })
    );
    if (!data) return jsonResponse(404, { ok: false, error: 'not_found' });

    const image = await timer.span('render', () => generateRankingOgImageResponse(data, variant));
    return withServerTiming(image, timer.done(`preview-route scope=global variant=${variant}`).serverTiming);
  }

  const rankEntityId = url.searchParams.get('rankEntityId') ?? '';
  const authorSpaceId = url.searchParams.get('authorSpaceId') ?? '';

  if (![rankEntityId, authorSpaceId, blockEntityId, blockEntitySpaceId].every(isValidEntityId)) {
    return jsonResponse(400, { ok: false, error: 'invalid_input' });
  }

  const data = await timer.span('data', () =>
    getRankingOgCardData({
      rankEntityId,
      authorSpaceId,
      blockEntityId,
      blockEntitySpaceId,
      rankingStartDate,
      rankingEndDate,
    })
  );
  if (!data) return jsonResponse(404, { ok: false, error: 'not_found' });

  const image = await timer.span('render', () => generateRankingOgImageResponse(data, variant));
  return withServerTiming(image, timer.done(`preview-route scope=personal variant=${variant}`).serverTiming);
}
