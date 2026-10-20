import { NextResponse } from 'next/server';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { withAcceptorLock } from '~/core/debates/server/acceptor-lock';
import { DebateNotPublishableError, listEarlyClaimCandidateDebateIds } from '~/core/debates/server/debate-source';
import { listEditorSpaceIds } from '~/core/debates/server/editor-spaces';
import { isEarlyClaimPublishEnabled, publishDebateClaimsEarly } from '~/core/debates/server/publish-debate-claims';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Bound the on-chain work per run. Runs every minute, so anything left over is a minute away.
const MAX_PUBLISH_ATTEMPTS_PER_SWEEP = 4;

// No publish starts after this point, so a run normally finishes, and releases the signing lock,
// inside the minute before the next one starts.
const PUBLISH_START_DEADLINE_MS = 40_000;

// Only debates whose opt-out window closed this recently. A claims-first media job has claims about
// six minutes after the debate ends, or up to two hours behind a cohort backlog; anything older is
// left to the full publish, which writes the same claims.
const RECENT_DEBATE_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * GEO-2870 option A: cron sweep that publishes each finished debate's extracted claims to the graph
 * as soon as geo-chat has them, ahead of the full debate publish (`/api/debates/publish-sweep`).
 * See `publishDebateClaimsEarly` for what it writes and why that cannot duplicate the full publish.
 *
 * Same discovery as the full sweep — the spaces the acceptor edits, then each space's recent
 * finished debates — and the same opt-out gate. Skips the run, rather than waiting, when the full
 * sweep holds the signing lock: the next run is a minute away.
 */
export async function GET(request: Request) {
  const requestStartedAt = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (!isEarlyClaimPublishEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'disabled' });
  }

  const config = getDebateAcceptorConfig();
  if (!config) {
    return NextResponse.json({ ok: true, skipped: 'acceptor_not_configured' });
  }

  const outcome = await withAcceptorLock(() => runSweep(config.spaceId, requestStartedAt), {
    ttlMs: maxDuration * 1000,
  });
  if (!outcome.ran) {
    return NextResponse.json({ ok: true, skipped: 'acceptor_busy' });
  }
  return NextResponse.json(outcome.value);
}

async function runSweep(acceptorSpaceId: string, startedAt: number) {
  const budgetExhausted = (attempted: number) =>
    attempted >= MAX_PUBLISH_ATTEMPTS_PER_SWEEP || Date.now() - startedAt >= PUBLISH_START_DEADLINE_MS;

  const spaceIds = await listEditorSpaceIds(acceptorSpaceId);
  const published: Array<{ debateId: string; claims: number }> = [];
  const failed: Array<{ debateId: string; error: string }> = [];
  let attempted = 0;
  let upToDate = 0;
  let noClaims = 0;
  let dedupPending = 0;
  let debatePublished = 0;
  let notEditor = 0;
  let notPublishable = 0;

  for (const spaceId of spaceIds) {
    if (budgetExhausted(attempted)) break;
    let debateIds: string[];
    try {
      debateIds = await listEarlyClaimCandidateDebateIds(spaceId, Date.now(), RECENT_DEBATE_WINDOW_MS);
    } catch (error) {
      failed.push({ debateId: `space:${spaceId}`, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const debateId of debateIds) {
      if (budgetExhausted(attempted)) break;
      try {
        const result = await publishDebateClaimsEarly(debateId);
        switch (result.status) {
          case 'published':
            attempted += 1;
            published.push({ debateId, claims: result.claimIds.length });
            break;
          case 'up_to_date':
            upToDate += 1;
            break;
          case 'no_claims':
            noClaims += 1;
            break;
          case 'dedup_pending':
            dedupPending += 1;
            break;
          case 'debate_published':
            debatePublished += 1;
            break;
          case 'not_editor':
            notEditor += 1;
            break;
          case 'acceptor_not_configured':
            break;
        }
      } catch (error) {
        if (error instanceof DebateNotPublishableError) {
          // Cancelled, still settling, or no longer complete: the candidate list was a snapshot.
          notPublishable += 1;
          continue;
        }
        attempted += 1;
        console.error(`[debate-acceptor] early claims publish failed for debate ${debateId}:`, error);
        failed.push({ debateId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return { ok: true, published, upToDate, noClaims, dedupPending, debatePublished, notEditor, notPublishable, failed };
}
