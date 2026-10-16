import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';

import { parseExploreTime } from './explore-feed-params';
import { EXPLORE_FEED_POLICY } from './explore-feed-policy';
import { parseExploreTypeIdsParam } from './explore-type-filter';
import { exploreBrowseSpaceIds, freshListScopeKey, warmSharedFreshList } from './fetch-explore-feed';
import { freshSlotActive } from './fresh-slot/fresh-slot-config';
import { readServingFreshSlotState } from './fresh-slot/fresh-slot-store';
import { readRecentFreshScopes } from './fresh-slot/recent-fresh-scopes';

/**
 * GEO-3308. The scopes whose shared Fresh list is rebuilt on a schedule: the scopes a reader lands
 * on without choosing anything, derived exactly as `/api/explore/feed` derives them.
 *
 * This is the signed-out default (the Featured spaces, Explore's default types, no time narrowing).
 * A signed-in reader's scope also holds the spaces they belong to, so it differs per person; those
 * are warmed from the scopes recently requested, see `warmRecentScopes`.
 */
export type WarmScope = { name: string; warm: () => Promise<'warmed' | 'skipped'> };

async function defaultScopeArgs(freshnessHours: number) {
  const browse = await fetchBrowseSidebarData(null);
  const spaceIds = exploreBrowseSpaceIds(browse, null);
  // The Featured list failed to load: an empty scope would warm a list no request reads.
  if (spaceIds.length === 0) throw new Error('featured spaces unresolved');
  return {
    spaceIds,
    time: parseExploreTime(null),
    typeIds: parseExploreTypeIdsParam(null),
    requireName: EXPLORE_FEED_POLICY.requireName,
    requireDebateTagOnClaims: EXPLORE_FEED_POLICY.requireDebateTagOnClaims,
    freshnessHours,
  };
}

export const WARM_SCOPES: readonly WarmScope[] = [
  {
    name: 'signed-out-default',
    warm: async () => {
      // The request path builds a Fresh list only while the slot is on, with the configured window.
      const { config } = await readServingFreshSlotState();
      if (!freshSlotActive(config)) return 'skipped';

      await warmSharedFreshList(await defaultScopeArgs(config.freshnessHours));
      return 'warmed';
    },
  },
];

/** At most this many recently requested scopes are warmed per run: the cap on added gaia queries. */
export const RECENT_SCOPES_PER_RUN = 10;
/** A scope nobody asked for in this long is dropped rather than warmed. */
export const RECENT_SCOPE_WINDOW_MS = 30 * 60_000;
export const RECENT_SCOPE_CONCURRENCY = 3;
/** No new scope starts after this; a started one needs ~5s more, well inside the 60s maxDuration. */
export const WARM_START_BUDGET_MS = 35_000;

export type WarmRecentResult = { scope: string; status: 'warmed' | 'skipped' | 'failed' };

/**
 * Warms the Fresh list of the scopes readers recently requested (GEO-3308), newest first, at most
 * `limit`, `concurrency` at a time, starting none once `budgetMs` has passed. Each warm goes through
 * `warmSharedFreshList`, which derives the scope key as the request path does, from the recorded
 * inputs. A recorded scope equal to the
 * signed-out default is skipped, as the default warm-up already covers it.
 */
export async function warmRecentScopes(
  options: {
    limit?: number;
    windowMs?: number;
    concurrency?: number;
    budgetMs?: number;
    now?: () => number;
  } = {}
): Promise<WarmRecentResult[]> {
  const {
    limit = RECENT_SCOPES_PER_RUN,
    windowMs = RECENT_SCOPE_WINDOW_MS,
    concurrency = RECENT_SCOPE_CONCURRENCY,
    budgetMs = WARM_START_BUDGET_MS,
    now = Date.now,
  } = options;
  const startedAt = now();

  const { config } = await readServingFreshSlotState();
  if (!freshSlotActive(config)) return [];

  let defaultKey: string | null = null;
  try {
    defaultKey = freshListScopeKey(await defaultScopeArgs(config.freshnessHours));
  } catch {
    // No default to exclude; at worst one scope is warmed twice.
  }
  const scopes = (await readRecentFreshScopes({ nowMs: startedAt, windowMs, limit })).filter(
    scope =>
      freshListScopeKey({
        ...scope,
        requireName: scope.requireName ?? undefined,
        requireDebateTagOnClaims: scope.requireDebateTagOnClaims ?? undefined,
      }) !== defaultKey
  );
  const results: WarmRecentResult[] = [];
  let next = 0;

  const worker = async () => {
    while (next < scopes.length && now() - startedAt < budgetMs) {
      const scope = scopes[next++]!;
      const name = `recent:${scope.spaceIds.length}spaces`;
      try {
        await warmSharedFreshList({
          spaceIds: scope.spaceIds,
          time: scope.time,
          typeIds: scope.typeIds,
          requireName: scope.requireName ?? undefined,
          requireDebateTagOnClaims: scope.requireDebateTagOnClaims ?? undefined,
          freshnessHours: scope.freshnessHours,
        });
        results.push({ scope: name, status: 'warmed' });
      } catch (error) {
        console.warn(`explore fresh list warm-up failed for ${name}`, error);
        results.push({ scope: name, status: 'failed' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, scopes.length) }, worker));
  return results;
}
