import { NextResponse } from 'next/server';

import { buildGeoPublisherProposal, getGeoPublisherStatus } from '~/core/space-calls/publisher/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store' };

/**
 * GET `?spaceId=`: whether the Geo publisher edits the space. POST `{ spaceId }`: the add-editor
 * proposal for the viewer to sign. Both answer signed-in editors of the space only (Privy identity
 * token in `Authorization`); anyone else gets 401 or 403. GEO-3593.
 */
export async function GET(request: Request) {
  const spaceId = new URL(request.url).searchParams.get('spaceId');
  const result = await getGeoPublisherStatus(request, spaceId);
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: result.status, headers: NO_STORE });
  return NextResponse.json({ status: result.status }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  }
  const spaceId =
    body && typeof body === 'object' && typeof (body as { spaceId?: unknown }).spaceId === 'string'
      ? (body as { spaceId: string }).spaceId
      : null;
  const result = await buildGeoPublisherProposal(request, spaceId);
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: result.status, headers: NO_STORE });
  return NextResponse.json(result.proposal, { headers: NO_STORE });
}
