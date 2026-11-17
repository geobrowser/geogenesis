import { NextResponse } from 'next/server';

import { withAcceptorLock } from '~/core/debates/server/acceptor-lock';
import { DebateNotPublishableError } from '~/core/debates/server/debate-source';
import { isAcceptorAdmin, parsePublishMissingClaimsBody } from '~/core/debates/server/publish-missing-claims-request';
import {
  type PublishMissingDebateClaimsResult,
  publishMissingDebateClaims,
} from '~/core/debates/server/publish-missing-debate-claims';
import { requireRankingLabAdmin } from '~/core/explore/fresh-slot/ranking-lab-admin';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store' };

/**
 * GEO-3635: publish the claims geo-chat added to debates that are already on the graph
 * (`publishMissingDebateClaims`). The one-off over the debates the moment backfill and re-renders
 * re-extracted; nothing calls it on a schedule.
 *
 * It signs as the debate acceptor into every space the acceptor edits, so two gates: the debate
 * scheduling admin check (`requireRankingLabAdmin`: Privy identity token in `Authorization`,
 * geo-chat session token in `x-geo-chat-authorization`, both naming one personal space), and that
 * space on `DEBATE_ACCEPTOR_ADMIN_SPACE_IDS`, a comma-separated allowlist that is empty unless set.
 *
 * Body: `{ debateIds, apply?, expect?, blockText?, reason }`. Without `apply` it is a dry run that
 * submits nothing and returns, per debate, everything it would write and a `fingerprint`. `apply`
 * submits only debates whose `expect[debateId]` equals a fresh plan's fingerprint, so what was
 * reviewed is what is written.
 */
export async function POST(request: Request) {
  const gate = await requireRankingLabAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: gate.code }, { status: gate.status, headers: NO_STORE });
  if (!isAcceptorAdmin(gate.admin.spaceId)) {
    return NextResponse.json({ error: 'not_acceptor_admin' }, { status: 403, headers: NO_STORE });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  }
  const body = parsePublishMissingClaimsBody(raw);
  if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400, headers: NO_STORE });

  console.log('[debate-acceptor] late claims publish requested', {
    by: gate.admin.spaceId,
    apply: body.apply,
    blockText: body.blockText,
    debates: body.debateIds.length,
    reason: body.reason,
  });

  const run = async () => {
    const results: Array<{ debateId: string; result?: PublishMissingDebateClaimsResult; error?: string }> = [];
    for (const debateId of body.debateIds) {
      try {
        const result = await publishMissingDebateClaims(debateId, {
          dryRun: !body.apply,
          expect: body.expect[debateId],
          blockText: body.blockText,
        });
        results.push({ debateId, result });
      } catch (error) {
        if (!(error instanceof DebateNotPublishableError)) {
          console.error(`[debate-acceptor] late claims publish failed for debate ${debateId}:`, error);
        }
        results.push({ debateId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  };

  // A dry run signs nothing, so only an apply takes the signing lock the sweeps share.
  if (!body.apply) return NextResponse.json({ apply: false, results: await run() }, { headers: NO_STORE });
  const outcome = await withAcceptorLock(run, { ttlMs: maxDuration * 1000, waitMs: 60_000 });
  if (!outcome.ran) return NextResponse.json({ error: 'acceptor_busy' }, { status: 409, headers: NO_STORE });
  return NextResponse.json({ apply: true, results: outcome.value }, { headers: NO_STORE });
}
