import { NextResponse } from 'next/server';

import { normalizePointsSpaceId, parseCuratorRewards } from '~/core/profile/profile-points';
import { IS_TESTNET } from '~/core/sdk/geo-network';

/**
 * A person's curator points, read from curator-backend's public `GET /user/rewards/:id` (GEO-3113).
 *
 * Same-origin so the backend host stays server-only: it reads `CURATOR_BACKEND_URL`, the variable
 * every `/api/community-call/*` route already uses, so no deploy needs a new setting and the host
 * can move without a rebuild. Narrow on purpose rather than another pass-through: it takes a space
 * id and nothing else, and answers `{ points }`.
 *
 * Testnet only. curator-backend reads the testnet graph, so on mainnet every id would come back as
 * a confident `0`.
 */

const UPSTREAM_TIMEOUT_MS = 5_000;

type Ctx = { params: Promise<{ spaceId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!IS_TESTNET) {
    return new NextResponse('not found', { status: 404 });
  }

  const spaceId = normalizePointsSpaceId((await ctx.params).spaceId);
  if (!spaceId) {
    return new NextResponse('invalid space id', { status: 400 });
  }

  const base = process.env.CURATOR_BACKEND_URL;
  if (!base) {
    return new NextResponse('points are not configured', { status: 503 });
  }

  try {
    const upstream = await fetch(`${base.replace(/\/$/, '')}/user/rewards/${spaceId}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return new NextResponse('points lookup failed', { status: 502 });
    }

    const points = parseCuratorRewards(await upstream.json());
    return NextResponse.json(
      { points },
      // A minute at the edge, matching the client's stale time: points move when someone is paid,
      // not by the second, and every profile view would otherwise be a request to curator-backend.
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    );
  } catch {
    return new NextResponse('points lookup failed', { status: 502 });
  }
}
