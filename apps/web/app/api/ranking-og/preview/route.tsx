import type { RankingOgCardData } from '~/core/blocks/ranking/ranking-og-data';
import { getRankingOgCardData } from '~/core/blocks/ranking/ranking-og-data';
import { generateRankingOgImageResponse } from '~/core/blocks/ranking/ranking-og-image';

import { isValidEntityId, jsonResponse, parseVariant } from '../route-utils';

export const runtime = 'nodejs';

const sampleData: RankingOgCardData = {
  rankEntityId: 'sample-rank',
  authorSpaceId: 'sample-author',
  blockEntityId: 'sample-block',
  blockEntitySpaceId: 'sample-space',
  rankingName: 'public goods projects',
  title: 'My public goods projects',
  periodLabel: 'Ends in 8 days',
  author: {
    name: 'Nico from Geo',
    avatarUrl: null,
    avatarSeed: 'nico',
  },
  entries: [
    {
      entityId: 'one',
      name: 'Hypercerts',
      description: 'Funding impact with crisp evidence trails',
      image: null,
    },
    {
      entityId: 'two',
      name: 'Protocol Guild',
      description: 'Sustaining core Ethereum contributors',
      image: null,
    },
    {
      entityId: 'three',
      name: 'Open source maintainers',
      description: 'The quiet backbone of shared software',
      image: null,
    },
    {
      entityId: 'four',
      name: 'Local-first tools',
      description: 'Software that keeps user agency close',
      image: null,
    },
    {
      entityId: 'five',
      name: 'Knowledge graphs',
      description: 'Better shared memory for the internet',
      image: null,
    },
  ],
};

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const variant = parseVariant(url.searchParams.get('variant')) ?? 'landscape';
  const rankEntityId = url.searchParams.get('rankEntityId') ?? '';
  const authorSpaceId = url.searchParams.get('authorSpaceId') ?? '';
  const blockEntityId = url.searchParams.get('blockEntityId') ?? '';
  const blockEntitySpaceId = url.searchParams.get('blockEntitySpaceId') ?? '';

  let data = sampleData;
  if ([rankEntityId, authorSpaceId, blockEntityId, blockEntitySpaceId].every(isValidEntityId)) {
    const fetched = await getRankingOgCardData({
      rankEntityId,
      authorSpaceId,
      blockEntityId,
      blockEntitySpaceId,
      rankingStartDate: url.searchParams.get('rankingStartDate') ?? '',
      rankingEndDate: url.searchParams.get('rankingEndDate') ?? '',
    });
    if (!fetched) return jsonResponse(404, { ok: false, error: 'not_found' });
    data = fetched;
  }

  return generateRankingOgImageResponse(data, variant);
}
