import { NextResponse } from 'next/server';

import { WARM_SCOPES, warmRecentScopes } from '~/core/explore/warm-fresh-lists';

// A cold Fresh query is ~4-7s (GEO-3308); leave room for several scopes and a slow tail.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GEO-3308. Cron: rebuild the shared Fresh list of the default scope and of recently requested ones and write it to Upstash, so no
 * visitor waits on the gaia query. Vercel Cron hits this every minute (see vercel.ts) with
 * `Authorization: Bearer $CRON_SECRET`. Scopes are independent: one failing is logged and does not
 * stop the others. The request path still refreshes behind its own response; this only means the
 * list is usually already there.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const results = await Promise.all(
    WARM_SCOPES.map(async scope => {
      try {
        return { scope: scope.name, status: await scope.warm() };
      } catch (error) {
        console.warn(`explore fresh list warm-up failed for ${scope.name}`, error);
        return { scope: scope.name, status: 'failed' as const };
      }
    })
  );
  // Then the scopes signed-in readers recently asked for (bounded, see `warmRecentScopes`).
  let recent: Awaited<ReturnType<typeof warmRecentScopes>> = [];
  try {
    recent = await warmRecentScopes();
  } catch (error) {
    console.warn('explore fresh list warm-up of recent scopes failed', error);
  }
  const all = [...results, ...recent];
  return NextResponse.json({ ok: all.every(result => result.status !== 'failed'), results: all });
}
