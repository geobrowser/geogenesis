import { NextResponse } from 'next/server';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { DebateNotPublishableError, listSweepCandidateDebateIds } from '~/core/debates/server/debate-source';
import { listEditorSpaceIds } from '~/core/debates/server/editor-spaces';
import { publishDebateAsAcceptor } from '~/core/debates/server/publish-debate';

// The sweep can sign several on-chain publishes in one run, so give it room past the default.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Bound the work per invocation. Anything left over is picked up on the next tick, where the
// idempotency check makes re-scanning already-published debates cheap. Each publish pins the final
// video to IPFS before signing, so only a couple fit inside `maxDuration`. Counts attempts rather
// than successes: a debate that pins its video and then fails on-chain has already spent the time.
const MAX_PUBLISH_ATTEMPTS_PER_SWEEP = 2;

/**
 * Cron sweep: publish finished debates to the knowledge graph as the debate acceptor.
 *
 * Vercel Cron hits this on a schedule (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * It discovers its own work: the acceptor can only publish into spaces it edits, so it enumerates
 * those from the graph, then for each lists that space's `complete` debates from geo-chat and
 * publishes them. Idempotent and self-healing: publishing skips debates already in the KG and
 * leaves debates whose media is still processing for the next tick. It's the sole publisher: no
 * browser or public route is in the loop, so nothing depends on a participant keeping a tab open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const config = getDebateAcceptorConfig();
  if (!config) {
    return NextResponse.json({ ok: true, skipped: 'acceptor_not_configured' });
  }

  const spaceIds = await listEditorSpaceIds(config.spaceId);
  const published: string[] = [];
  const failed: Array<{ debateId: string; error: string }> = [];
  let attempted = 0;
  let alreadyPublished = 0;
  let notEditor = 0;
  let pending = 0;
  let skipped = 0;
  // Debates whose media will never be publishable. Counted apart from `pending` because the two
  // want opposite reactions: a backlog drains itself, this does not.
  const mediaFailed: string[] = [];

  for (const spaceId of spaceIds) {
    let debateIds: string[];
    try {
      debateIds = await listSweepCandidateDebateIds(spaceId);
    } catch (error) {
      failed.push({ debateId: `space:${spaceId}`, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const debateId of debateIds) {
      if (attempted >= MAX_PUBLISH_ATTEMPTS_PER_SWEEP) break;
      try {
        const result = await publishDebateAsAcceptor(debateId);
        if (result.status === 'already_published') {
          alreadyPublished += 1;
          continue;
        }
        attempted += 1;
        if (result.status === 'published') published.push(debateId);
        else if (result.status === 'not_editor') notEditor += 1;
      } catch (error) {
        if (error instanceof DebateNotPublishableError) {
          if (error.code === 'media_failed') {
            // Terminal: the worker has spent its retries, so no later tick will publish this.
            // Collected rather than logged here — the sweep runs every five minutes and these
            // debates never leave the list, so a line each would be a few hundred a day per stuck
            // debate. One aggregate line below carries the same information without the noise.
            mediaFailed.push(debateId);
          } else if (error.code === 'media_not_ready' || error.code === 'not_complete') {
            // Media still processing or lifecycle state changed — retry next tick.
            pending += 1;
          } else {
            // Cancelled or still settling: candidate discovery normally filters these, and a
            // repeated source check keeps a stale sweep snapshot from publishing them.
            skipped += 1;
          }
          continue;
        }
        attempted += 1;
        console.error(`[debate-acceptor] sweep failed to publish debate ${debateId}:`, error);
        failed.push({ debateId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  if (mediaFailed.length > 0) {
    console.error('[debate-acceptor] debates permanently unpublishable this sweep', {
      count: mediaFailed.length,
      debateIds: mediaFailed,
    });
  }

  return NextResponse.json({
    ok: true,
    published,
    alreadyPublished,
    notEditor,
    pending,
    // Every unpublishable debate the sweep saw, by id, on every tick — so the answer to "how many
    // debates are stuck?" is a number someone can read rather than an archaeology exercise.
    mediaFailed,
    skipped,
    failed,
  });
}
