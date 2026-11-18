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
 * Cron: writes due calls as Call Event entities in the acceptor's editor spaces. Separate from the
 * debate sweep so it never lengthens that run's lock hold; skips the tick when the lock is held.
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
