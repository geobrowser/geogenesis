/**
 * Own recurring `.ics` feed for a community-call series — powers the `webcal://`
 * subscription link (`buildWebcalHref`). Computed entirely from our own indexer data
 * (no curator-backend/rendezvous call), unlike the rest of `/api/community-call/*`
 * which proxies to curator-backend. More specific than the `[...path]` catch-all
 * proxy one level up, so Next.js routes requests here first.
 */
import { Effect } from 'effect';

import { CALL_SCHEMA } from '~/core/community-calls/constants';
import { buildCallJoinUrl, buildSeriesIcsBody } from '~/core/community-calls/format';
import { getEntity } from '~/core/io/queries';

type Ctx = { params: Promise<{ spaceId: string; callId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { spaceId, callId } = await ctx.params;

  const entity = await Effect.runPromise(getEntity(callId, spaceId)).catch(() => null);
  const schedule = entity?.values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value;

  if (!entity || !schedule) {
    return new Response('Community call not found', { status: 404 });
  }

  const body = buildSeriesIcsBody({
    callId,
    name: entity.name ?? 'Community call',
    schedule,
    joinUrl: buildCallJoinUrl({ origin: new URL(req.url).origin, spaceId, callId }),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${callId}.ics"`,
    },
  });
}
