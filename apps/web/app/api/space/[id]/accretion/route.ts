import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import type { AccretionPeriod } from '~/core/community/accretion-types';
import { fetchAccretionDashboard } from '~/core/community/fetch-accretion-dashboard';

export const revalidate = 300;

const VALID_PERIODS = new Set<AccretionPeriod>(['week', 'month', 'year', 'all']);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id: spaceId } = await context.params;
  if (!IdUtils.isValid(spaceId)) {
    return NextResponse.json({ error: 'Invalid space id' }, { status: 400 });
  }

  const periodParam = new URL(request.url).searchParams.get('period') ?? 'year';
  const period = VALID_PERIODS.has(periodParam as AccretionPeriod) ? (periodParam as AccretionPeriod) : 'year';

  try {
    const data = await fetchAccretionDashboard({ spaceId, period });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[ACCRETION_DASHBOARD] Failed to build dashboard', error);
    return NextResponse.json({ error: 'Failed to load accretion dashboard' }, { status: 502 });
  }
}
