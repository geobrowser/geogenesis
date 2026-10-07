import { NextResponse } from 'next/server';

import { type AdminPairFitResponse, MAX_PAIR_FIT_CANDIDATES } from '~/core/debates/matchmaking/pair-fit';
import { fetchGaiaPairFit } from '~/core/debates/server/gaia-pair-fit';
import { requireRankingLabAdmin } from '~/core/explore/fresh-slot/ranking-lab-admin';
import { normId } from '~/core/utils/norm-id';

/**
 * New match's pair fit (GEO-3224): how good a debate debater 1 would make with each candidate,
 * from gaia's private `/internal/pair-fit`.
 *
 * Admins only, by the debate scheduling admin's own allowlist (`requireRankingLabAdmin` asks
 * geo-chat), checked before gaia is called: the answer is about people's positions. The token
 * that reaches gaia never leaves this server.
 *
 * Body: `{ userId, candidateIds }`, personal space ids. Answers `{ available, items }`, and
 * `available: false` whenever gaia is not configured or does not answer in time, so the dialog
 * keeps its existing order. Never cached.
 */

const NO_STORE = { 'cache-control': 'private, no-store' };
const SPACE_ID = /^[0-9a-f]{32}$/;

function parseBody(raw: unknown): { userId: string; candidateIds: string[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { userId, candidateIds } = raw as Record<string, unknown>;
  if (typeof userId !== 'string' || !Array.isArray(candidateIds)) return null;
  const user = normId(userId);
  if (!SPACE_ID.test(user)) return null;
  const ids: string[] = [];
  for (const id of candidateIds) {
    if (typeof id !== 'string') return null;
    const n = normId(id);
    if (!SPACE_ID.test(n)) return null;
    if (n !== user && !ids.includes(n)) ids.push(n);
  }
  if (ids.length > MAX_PAIR_FIT_CANDIDATES) return null;
  return { userId: user, candidateIds: ids };
}

export async function POST(request: Request) {
  const gate = await requireRankingLabAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: gate.code }, { status: gate.status, headers: NO_STORE });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: NO_STORE });
  }
  const body = parseBody(raw);
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: NO_STORE });

  const items = body.candidateIds.length > 0 ? await fetchGaiaPairFit(body) : [];
  const response: AdminPairFitResponse = items ? { available: true, items } : { available: false, items: [] };
  return NextResponse.json(response, { headers: NO_STORE });
}
