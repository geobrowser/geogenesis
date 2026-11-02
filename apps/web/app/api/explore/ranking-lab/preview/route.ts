import { NextResponse } from 'next/server';

import { DEFAULT_EXPLORE_TYPE_IDS } from '~/core/explore/explore-constants';
import { exploreItemTypeKey } from '~/core/explore/explore-diversity';
import { EXPLORE_FEED_POLICY } from '~/core/explore/explore-feed-policy';
import { sanitizeExploreTypeIds } from '~/core/explore/explore-type-filter';
import { type ExploreFeedItem, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { parseFreshSlotConfig } from '~/core/explore/fresh-slot/fresh-slot-config';
import { requireRankingLabAdmin } from '~/core/explore/fresh-slot/ranking-lab-admin';
import type { RankingLabPreviewItem, RankingLabPreviewResponse } from '~/core/explore/fresh-slot/ranking-lab-types';
import { resolveExploreFeedRequestContext } from '~/core/explore/resolve-explore-feed-request-context';
import { normId } from '~/core/utils/norm-id';

/**
 * The ranking lab's preview (GEO-3221): Best as readers get it now, beside Best with the fresh slot
 * under the knobs the admin is editing, unsaved. Several pages of each are walked by their own
 * cursors, so the preview also shows the merge paging without repeats. Admin-only, like the config.
 *
 * Both columns run at the same instant, so the fresh list is the one a reader opening Explore now
 * would get. Like the real feed, the scope is the requesting admin's own visible spaces.
 */

const MAX_PREVIEW_PAGES = 4;

function previewItem(item: ExploreFeedItem): RankingLabPreviewItem {
  const typeId = exploreItemTypeKey(item);
  return {
    entityId: item.entityId,
    spaceId: item.spaceId,
    title: item.title,
    typeId,
    typeName: item.types.find(type => normId(type.id) === typeId)?.name ?? null,
    createdAtSec: item.createdAtSec,
    fresh: item.ranking?.slot === 'fresh',
  };
}

export async function POST(request: Request) {
  const gate = await requireRankingLabAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: gate.code }, { status: gate.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = parseFreshSlotConfig(body?.config);
  if (!parsed.ok) return NextResponse.json({ error: 'rejected', errors: parsed.errors }, { status: 400 });
  const pages = Math.min(
    MAX_PREVIEW_PAGES,
    Math.max(1, typeof body.pages === 'number' && Number.isFinite(body.pages) ? Math.round(body.pages) : 2)
  );
  const requestedTypes = Array.isArray(body.typeIds) ? sanitizeExploreTypeIds(body.typeIds) : [];
  const typeIds = requestedTypes.length > 0 ? requestedTypes : DEFAULT_EXPLORE_TYPE_IDS;

  const { browse, memberOrEditorSpaceIds, walletAddress } = await resolveExploreFeedRequestContext();
  const now = Date.now();
  const walk = async (freshSlot: Parameters<typeof fetchExploreFeed>[0]['freshSlot']) => {
    const out: ExploreFeedItem[][] = [];
    let cursor: string | null = null;
    let version: string | null = null;
    for (let page = 0; page < pages; page += 1) {
      const result = await fetchExploreFeed({
        browse,
        sort: 'best',
        time: 'all',
        spaceFilterIds: null,
        cursor,
        walletAddress,
        memberOrEditorSpaceIds,
        typeIds,
        ...EXPLORE_FEED_POLICY,
        freshSlot,
      });
      out.push(result.items);
      version ??= result.feed?.version ?? null;
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return { pages: out, version };
  };

  try {
    // In turn rather than side by side: both open on the same lead-debate lookups, and the second
    // reuses what the first warmed.
    const best = await walk(undefined);
    const merged = await walk({ config: { ...parsed.config, enabled: true }, revision: 0, now });
    const counts = new Map<string, number>();
    for (const item of merged.pages.flat()) counts.set(item.entityId, (counts.get(item.entityId) ?? 0) + 1);

    const response: RankingLabPreviewResponse = {
      best: best.pages.map(page => page.map(previewItem)),
      merged: merged.pages.map(page => page.map(previewItem)),
      mergedVersion: merged.version,
      repeats: [...counts].filter(([, count]) => count > 1).map(([id]) => id),
      adjustments: parsed.adjustments,
    };
    return NextResponse.json(response, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    console.error('ranking lab preview', error);
    return NextResponse.json({ error: 'preview_failed' }, { status: 502 });
  }
}
