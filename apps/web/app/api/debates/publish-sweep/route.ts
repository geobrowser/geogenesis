import { NextResponse } from 'next/server';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { withAcceptorLock } from '~/core/debates/server/acceptor-lock';
import { DebateNotPublishableError, assertDebateMediaHostConfigured } from '~/core/debates/server/debate-source';
import { listEditorSpaceIds } from '~/core/debates/server/editor-spaces';
import { listPublishCandidateDebateIds } from '~/core/debates/server/publish-candidates';
import { publishDebateAsAcceptor } from '~/core/debates/server/publish-debate';

// The sweep can sign several on-chain publishes in one run, so give it room past the default.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Bound the work per invocation; anything left over is picked up on the next tick. A publish is
// the share-card pin plus two or three confirmed on-chain user operations. Counts attempts rather
// than successes, since a failed publish has already spent the time.
const MAX_PUBLISH_ATTEMPTS_PER_SWEEP = 8;

// No publish starts after this point in the run. A publish interrupted by `maxDuration` after its
// proposal lands leaves no Debate entity for the idempotency check, so the next tick would create
// duplicate media and transcript entities. The remaining time is headroom for the publish in flight.
const PUBLISH_START_DEADLINE_MS = 180_000;

// How long to wait for the early claims sweep to release the signing lock. The wait comes out of
// the publish deadline (both run from the request's start), so it never eats the headroom left
// for a publish in flight.
const LOCK_WAIT_MS = 60_000;

/**
 * Cron sweep: publish finished debates to the knowledge graph as the debate acceptor.
 *
 * Vercel Cron hits this on a schedule (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * It discovers its own work: the acceptor can only publish into spaces it edits, so it enumerates
 * those from the graph, then for each asks geo-chat for that space's publish candidates (every
 * finished debate not yet seen in the graph, however old: GEO-3157) and publishes them. Idempotent and self-healing: publishing skips debates already in the KG and
 * leaves debates whose media is still processing for the next tick. It's the sole publisher: no
 * browser or public route is in the loop, so nothing depends on a participant keeping a tab open.
 */
export async function GET(request: Request) {
  const requestStartedAt = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const config = getDebateAcceptorConfig();
  if (!config) {
    return NextResponse.json({ ok: true, skipped: 'acceptor_not_configured' });
  }

  // Fail the run once on a misconfigured media host rather than once per candidate debate.
  try {
    assertDebateMediaHostConfigured();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[debate-acceptor] sweep refused: media host misconfigured', { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // One acceptor signing at a time (see `acceptor-lock.ts`). The early claims sweep beside this one
  // holds the lock for well under a minute, so wait for it rather than skipping a five-minute tick.
  const outcome = await withAcceptorLock(() => runSweep(config.spaceId, requestStartedAt), {
    ttlMs: maxDuration * 1000,
    waitMs: LOCK_WAIT_MS,
  });
  if (!outcome.ran) {
    console.warn('[debate-acceptor] sweep skipped: another publish run holds the signing lock');
    return NextResponse.json({ ok: true, skipped: 'acceptor_busy' });
  }
  return NextResponse.json(outcome.value);
}

async function runSweep(acceptorSpaceId: string, startedAt: number) {
  const budgetExhausted = (attempted: number) =>
    attempted >= MAX_PUBLISH_ATTEMPTS_PER_SWEEP || Date.now() - startedAt >= PUBLISH_START_DEADLINE_MS;

  const spaceIds = await listEditorSpaceIds(acceptorSpaceId);
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
    if (budgetExhausted(attempted)) break;
    let debateIds: string[];
    try {
      debateIds = await listPublishCandidateDebateIds(spaceId);
    } catch (error) {
      failed.push({ debateId: `space:${spaceId}`, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const debateId of debateIds) {
      if (budgetExhausted(attempted)) break;
      try {
        const result = await publishDebateAsAcceptor(debateId);
        if (result.status === 'already_published') {
          alreadyPublished += 1;
          continue;
        }
        if (result.status === 'not_editor') {
          // Terminal and cheap (checked before any source is loaded), so it does not spend a slot.
          notEditor += 1;
          continue;
        }
        attempted += 1;
        if (result.status === 'published') published.push(debateId);
      } catch (error) {
        if (error instanceof DebateNotPublishableError) {
          if (error.code === 'media_failed') {
            // Terminal: the worker has spent its retries, so no later tick will publish this.
            // Candidate discovery drops debates the listing already reports as terminal
            // (GEO-2985), so this only catches ones it could not see: a geo-chat older than the
            // listing's `media` field, or a job that died between the listing and this read.
            // Collected rather than logged here; one aggregate line below carries it.
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

  return {
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
  };
}
