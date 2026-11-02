import { NextResponse } from 'next/server';

import { DEFAULT_FRESH_SLOT_CONFIG, FRESH_SLOT_BOUNDS } from '~/core/explore/fresh-slot/fresh-slot-config';
import {
  type FreshSlotStore,
  readFreshSlotHistory,
  readFreshSlotState,
  rollbackFreshSlotConfig,
  saveFreshSlotConfig,
  upstashFreshSlotStore,
} from '~/core/explore/fresh-slot/fresh-slot-store';
import { type RankingLabAdminResult, requireRankingLabAdmin } from '~/core/explore/fresh-slot/ranking-lab-admin';
import { fetchRankingParams } from '~/core/explore/fresh-slot/ranking-params';
import { SEEN_DEMOTION_BOUNDS } from '~/core/explore/seen-demotion/seen-demotion-config';

/**
 * The ranking lab's config API (GEO-3221). Every method is admin-only (see `requireRankingLabAdmin`)
 * and checks that before reading or writing anything.
 *
 * GET: the live fresh slot config, its history and Best's read-only ranking parameters.
 * PUT: `{ config, baseRevision }` saves a config. POST: `{ action: 'rollback', toRevision,
 * baseRevision }` restores the config a history entry saved. `baseRevision` is the revision the
 * page loaded, so two admins cannot silently overwrite each other (409).
 */

const NO_STORE = { 'cache-control': 'private, no-store' };

function refusal(gate: Extract<RankingLabAdminResult, { ok: false }>) {
  return NextResponse.json({ error: gate.code }, { status: gate.status, headers: NO_STORE });
}

function storeOrUnavailable(): FreshSlotStore | NextResponse {
  return (
    upstashFreshSlotStore() ??
    NextResponse.json({ error: 'config_store_not_configured' }, { status: 503, headers: NO_STORE })
  );
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function revisionOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function GET(request: Request) {
  const gate = await requireRankingLabAdmin(request);
  if (!gate.ok) return refusal(gate);

  const store = upstashFreshSlotStore();
  const [state, history, rankingParams] = await Promise.all([
    store ? readFreshSlotState(store) : null,
    store ? readFreshSlotHistory(store) : [],
    fetchRankingParams().catch(error => {
      console.error('ranking lab: ranking parameters unreadable', error);
      return null;
    }),
  ]);

  return NextResponse.json(
    {
      storeConfigured: store !== null,
      state,
      history,
      defaults: DEFAULT_FRESH_SLOT_CONFIG,
      bounds: FRESH_SLOT_BOUNDS,
      seenDemotionBounds: SEEN_DEMOTION_BOUNDS,
      rankingParams,
      viewer: { spaceId: gate.admin.spaceId },
    },
    { headers: NO_STORE }
  );
}

export async function PUT(request: Request) {
  const gate = await requireRankingLabAdmin(request);
  if (!gate.ok) return refusal(gate);
  const store = storeOrUnavailable();
  if (store instanceof NextResponse) return store;

  const body = await readBody(request);
  const baseRevision = revisionOf(body?.baseRevision);
  if (!body || baseRevision === null) {
    return NextResponse.json({ error: 'bad_request', errors: ['expected { config, baseRevision }'] }, { status: 400 });
  }

  const result = await saveFreshSlotConfig(store, { input: body.config, baseRevision, by: gate.admin.spaceId });
  if (!result.ok) {
    return NextResponse.json(
      { error: 'rejected', errors: result.errors },
      { status: result.status, headers: NO_STORE }
    );
  }
  return NextResponse.json({ state: result.state, adjustments: result.adjustments }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const gate = await requireRankingLabAdmin(request);
  if (!gate.ok) return refusal(gate);
  const store = storeOrUnavailable();
  if (store instanceof NextResponse) return store;

  const body = await readBody(request);
  const baseRevision = revisionOf(body?.baseRevision);
  const toRevision = revisionOf(body?.toRevision);
  if (body?.action !== 'rollback' || baseRevision === null || toRevision === null) {
    return NextResponse.json(
      { error: 'bad_request', errors: ["expected { action: 'rollback', toRevision, baseRevision }"] },
      { status: 400 }
    );
  }

  const result = await rollbackFreshSlotConfig(store, { toRevision, baseRevision, by: gate.admin.spaceId });
  if (!result.ok) {
    return NextResponse.json(
      { error: 'rejected', errors: result.errors },
      { status: result.status, headers: NO_STORE }
    );
  }
  return NextResponse.json({ state: result.state }, { headers: NO_STORE });
}
