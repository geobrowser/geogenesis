import { NextResponse } from 'next/server';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { DebateNotPublishableError, listSweepCandidateDebateIds } from '~/core/debates/server/debate-source';
import { publishDebateAsAcceptor } from '~/core/debates/server/publish-debate';

// The sweep can sign several on-chain publishes in one run, so give it room past the default.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Bound the on-chain work per invocation. Anything left over is picked up on the next tick, where
// the idempotency check makes re-scanning already-published debates cheap.
const MAX_PUBLISHES_PER_SWEEP = 5;

function getSweepSpaceIds(): string[] {
  return (process.env.DEBATE_ACCEPTOR_SWEEP_SPACE_IDS ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

/**
 * Cron sweep: publish finished debates to the knowledge graph as the debate acceptor.
 *
 * Vercel Cron hits this on a schedule (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * For each space in the `DEBATE_ACCEPTOR_SWEEP_SPACE_IDS` allowlist, it lists that space's
 * `complete` debates from geo-chat and publishes each one. Idempotent and self-healing: publishing
 * skips debates already in the KG, skips spaces the acceptor can't edit, and leaves debates whose
 * media is still processing for the next tick. It's the sole publisher: no browser or public route
 * is in the loop, so nothing depends on a participant keeping a tab open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!getDebateAcceptorConfig()) {
    return NextResponse.json({ ok: true, skipped: 'acceptor_not_configured' });
  }

  const spaceIds = getSweepSpaceIds();
  const published: string[] = [];
  const failed: Array<{ debateId: string; error: string }> = [];
  let alreadyPublished = 0;
  let notEditor = 0;
  let pending = 0;

  for (const spaceId of spaceIds) {
    let debateIds: string[];
    try {
      debateIds = await listSweepCandidateDebateIds(spaceId);
    } catch (error) {
      failed.push({ debateId: `space:${spaceId}`, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const debateId of debateIds) {
      if (published.length >= MAX_PUBLISHES_PER_SWEEP) break;
      try {
        const result = await publishDebateAsAcceptor(debateId);
        if (result.status === 'published') published.push(debateId);
        else if (result.status === 'already_published') alreadyPublished += 1;
        else if (result.status === 'not_editor') notEditor += 1;
      } catch (error) {
        if (error instanceof DebateNotPublishableError) {
          // Media still processing — retried next tick, not a failure.
          pending += 1;
          continue;
        }
        console.error(`[debate-acceptor] sweep failed to publish debate ${debateId}:`, error);
        failed.push({ debateId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return NextResponse.json({ ok: true, published, alreadyPublished, notEditor, pending, failed });
}
