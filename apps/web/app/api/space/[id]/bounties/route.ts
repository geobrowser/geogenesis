import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { fetchSpaceBounties } from '~/core/community/fetch-space-bounties';
import { BOUNTY_TASK_STATUS_DONE_ENTITY_ID } from '~/core/constants';

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
  const requestedStatus = searchParams.get('taskStatusId');
  const taskStatusId =
    requestedStatus && IdUtils.isValid(requestedStatus) ? requestedStatus : BOUNTY_TASK_STATUS_DONE_ENTITY_ID;

  try {
    const data = await fetchSpaceBounties({ spaceId, taskStatusId });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[SPACE_BOUNTIES] Failed to load bounties', error);
    return NextResponse.json({ error: 'Failed to load bounties' }, { status: 502 });
  }
}
