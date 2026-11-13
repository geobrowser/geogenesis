import { NextResponse } from 'next/server';

import { isAcceptorAdmin } from '~/core/debates/server/publish-missing-claims-request';
import { refreshDebateShareCards } from '~/core/debates/server/refresh-debate-share-cards';
import { parseRefreshShareCardsBody } from '~/core/debates/server/refresh-share-cards-request';
import { requireRankingLabAdmin } from '~/core/explore/fresh-slot/ranking-lab-admin';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store' };

/**
 * GEO-3722: redraw the share card of debates already on the graph, in the current card design
 * (`refreshDebateShareCards`). A one-off backfill run by hand; nothing calls it on a schedule.
 *
 * Same two gates as the late claims route, because it signs as the debate acceptor: the debate
 * scheduling admin check (`requireRankingLabAdmin`: Privy identity token in `Authorization`,
 * geo-chat session token in `x-geo-chat-authorization`) and that admin's space on
 * `DEBATE_ACCEPTOR_ADMIN_SPACE_IDS`.
 *
 * Body: `{ debateIds, apply?, reason }`. Without `apply` it is a dry run: nothing is rendered,
 * pinned or submitted, and each debate reports what would change (create or update), which Image
 * entities, what they hold now, and a live preview URL. With `apply`, debates are redrawn in one
 * edit per claim space; `unprocessed` lists any the time budget or a busy signing lock left, to be
 * posted again. 409 `acceptor_busy` means the lock was busy and is returned with the same body.
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
  const body = parseRefreshShareCardsBody(raw);
  if ('error' in body) return NextResponse.json({ error: body.error }, { status: 400, headers: NO_STORE });

  console.log('[debate-acceptor] share card redraw requested', {
    by: gate.admin.spaceId,
    apply: body.apply,
    debates: body.debateIds.length,
    reason: body.reason,
  });

  const run = await refreshDebateShareCards(body.debateIds, { apply: body.apply });
  if (run.status === 'acceptor_not_configured') {
    return NextResponse.json({ error: 'acceptor_not_configured' }, { status: 503, headers: NO_STORE });
  }

  const payload = { apply: body.apply, results: run.results, unprocessed: run.unprocessed };
  if (run.acceptorBusy) {
    return NextResponse.json({ error: 'acceptor_busy', ...payload }, { status: 409, headers: NO_STORE });
  }
  return NextResponse.json(payload, { headers: NO_STORE });
}
