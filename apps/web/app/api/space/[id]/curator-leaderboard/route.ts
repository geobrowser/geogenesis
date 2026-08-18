import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import type { CuratorLeaderboardPeriod } from '~/core/community/curator-leaderboard-types';
import { fetchCuratorLeaderboard } from '~/core/community/fetch-curator-leaderboard';

const VALID_PERIODS = new Set<CuratorLeaderboardPeriod>(['week', 'month', 'year', 'all']);

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
  const periodParam = searchParams.get('period') ?? 'week';
  const period = VALID_PERIODS.has(periodParam as CuratorLeaderboardPeriod)
    ? (periodParam as CuratorLeaderboardPeriod)
    : 'week';
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
