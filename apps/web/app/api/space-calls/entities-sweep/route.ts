import { NextResponse } from 'next/server';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { withAcceptorLock } from '~/core/debates/server/acceptor-lock';
import { listEditorSpaceIds } from '~/core/debates/server/editor-spaces';
import { sweepCallEntities } from '~/core/space-calls/entities/sweep';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// No call is claimed after this point, so the signing lock is held for a minute plus the write in
// flight, never as long as the debate publish sweep.
const CALL_START_DEADLINE_MS = 60_000;

/**
 * Cron sweep (vercel.ts): writes due calls to the graph as Call Event entities (GEO-3593), as the
 * debate acceptor, in the spaces it edits. Its own route, so it never lengthens a debate publish
 * run's hold on the signing lock; when another run holds it, this tick is skipped.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const config = getDebateAcceptorConfig();
  if (!config) return NextResponse.json({ ok: true, skipped: 'acceptor_not_configured' });

  const outcome = await withAcceptorLock(
    async () => {
      const spaceIds = await listEditorSpaceIds(config.spaceId);
      return sweepCallEntities(config, spaceIds, { canStart: () => Date.now() - startedAt < CALL_START_DEADLINE_MS });
    },
    { ttlMs: maxDuration * 1000 }
  );
  if (!outcome.ran) return NextResponse.json({ ok: true, skipped: 'acceptor_busy' });
  return NextResponse.json({ ok: true, calls: outcome.value });
}
