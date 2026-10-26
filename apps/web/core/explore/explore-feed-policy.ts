import { EXPLORE_EXCLUDED_TYPE_IDS } from './explore-constants';

/**
 * The rules Explore's own feed applies on top of a sort, shared by `/api/explore/feed` and the
 * ranking lab's preview so the preview shows exactly what readers get.
 */
export const EXPLORE_FEED_POLICY = {
  excludeTypeIds: EXPLORE_EXCLUDED_TYPE_IDS,
  requireName: true,
  // GEO-2835. A restriction on the feed rather than on the selection, unlike the types filter:
  // ticking Claim asks for the claims Explore has, and an untagged one is not among them.
  requireDebateTagOnClaims: true,
  // GEO-3070. Explore's Best opens on a playable debate.
  leadWithPlayableDebate: true,
} as const;
