import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';

import { parseExploreTime } from './explore-feed-params';
import { EXPLORE_FEED_POLICY } from './explore-feed-policy';
import { parseExploreTypeIdsParam } from './explore-type-filter';
import { exploreBrowseSpaceIds, warmSharedFreshList } from './fetch-explore-feed';
import { freshSlotActive } from './fresh-slot/fresh-slot-config';
import { readServingFreshSlotState } from './fresh-slot/fresh-slot-store';

/**
 * GEO-3308. The scopes whose shared Fresh list is rebuilt on a schedule: the scopes a reader lands
 * on without choosing anything, derived exactly as `/api/explore/feed` derives them.
 *
 * Today that is one: the signed-out default (the Featured spaces, Explore's default types, no time
 * narrowing). A signed-in reader's scope also holds the spaces they belong to, so it differs per
 * person and is not warmed; nor is a scope a reader narrowed by choosing spaces, types or a time.
 */
export type WarmScope = { name: string; warm: () => Promise<'warmed' | 'skipped'> };

export const WARM_SCOPES: readonly WarmScope[] = [
  {
    name: 'signed-out-default',
    warm: async () => {
      // The request path builds a Fresh list only while the slot is on, with the configured window.
      const { config } = await readServingFreshSlotState();
      if (!freshSlotActive(config)) return 'skipped';

      const browse = await fetchBrowseSidebarData(null);
      const spaceIds = exploreBrowseSpaceIds(browse, null);
      // The Featured list failed to load: an empty scope would warm a list no request reads.
      if (spaceIds.length === 0) throw new Error('featured spaces unresolved');

      await warmSharedFreshList({
        spaceIds,
        time: parseExploreTime(null),
        typeIds: parseExploreTypeIdsParam(null),
        requireName: EXPLORE_FEED_POLICY.requireName,
        requireDebateTagOnClaims: EXPLORE_FEED_POLICY.requireDebateTagOnClaims,
        freshnessHours: config.freshnessHours,
      });
      return 'warmed';
    },
  },
];
