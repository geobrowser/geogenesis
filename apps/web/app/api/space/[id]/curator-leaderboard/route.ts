import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { parseCuratorLeaderboardPeriod } from '~/core/community/curator-leaderboard-types';
import { fetchCuratorLeaderboard } from '~/core/community/fetch-curator-leaderboard';

export const revalidate = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id: spaceId } = await context.params;

  if (!IdUtils.isValid(spaceId)) {
    return NextResponse.json({ error: 'Invalid space id' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const period = parseCuratorLeaderboardPeriod(searchParams.get('period'));
  const currentUserSpaceId = searchParams.get('currentUserSpaceId');

  try {
    const data = await fetchCuratorLeaderboard({
      spaceId,
      period,
      currentUserSpaceId: currentUserSpaceId && IdUtils.isValid(currentUserSpaceId) ? currentUserSpaceId : null,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[CURATOR_LEADERBOARD] Failed to build the leaderboard', error);
    return NextResponse.json({ error: 'Failed to load the curator leaderboard' }, { status: 502 });
  }
}
