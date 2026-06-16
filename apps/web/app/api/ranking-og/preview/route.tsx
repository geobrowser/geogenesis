import { getGlobalRankingOgCardData, getRankingOgCardData } from '~/core/blocks/ranking/ranking-og-data';
import { generateRankingOgImageResponse } from '~/core/blocks/ranking/ranking-og-image';

import { isValidEntityId, jsonResponse, parseVariant } from '../route-utils';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
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

    const data = await getGlobalRankingOgCardData({
      blockEntityId,
      blockEntitySpaceId,
      rankingStartDate,
      rankingEndDate,
    });
    if (!data) return jsonResponse(404, { ok: false, error: 'not_found' });

    return generateRankingOgImageResponse(data, variant);
  }

  const rankEntityId = url.searchParams.get('rankEntityId') ?? '';
  const authorSpaceId = url.searchParams.get('authorSpaceId') ?? '';

  if (![rankEntityId, authorSpaceId, blockEntityId, blockEntitySpaceId].every(isValidEntityId)) {
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
  if (!data) return jsonResponse(404, { ok: false, error: 'not_found' });

  return generateRankingOgImageResponse(data, variant);
}
