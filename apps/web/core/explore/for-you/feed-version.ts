/**
 * Which ranking produced a feed page, and which produced each card on it (GEO-3140, GEO-3144).
 *
 * Every Explore Best / For you page names its ranking and version, and every card carries the
 * version that contributed it, so engagement can be credited to a version — the basis of
 * interleaving and of any week-on-week comparison. Analytics reads `feed_version` / `feed_arm` from
 * the card's action context (see `ExploreCardSurface`).
 *
 * BEST_FEED_VERSION is bumped BY HAND on any change to what Best serves: its candidate query, the
 * gaia ranking parameters (`entity_ranking_config`), the type mix, the per-space quota or the lead
 * debate. For you's version is assembled from gaia's, which bumps itself on any gaia-side change
 * (code version plus a config revision kept by trigger, migration 0102), and this app's own
 * FOR_YOU_WEB_VERSION, bumped by hand on any change to how this app builds a For you page.
 */

export const BEST_FEED_VERSION = 'best-1';

/** This app's half of For you: candidates (Best's window), the diversity pass, the lead debate. */
export const FOR_YOU_WEB_VERSION = 1;

/** e.g. `for-you-1.0+web.1`: gaia's `for-you-<code>.<config revision>`, plus this app's version. */
export function forYouFeedVersion(gaiaVersion: string): string {
  return `${gaiaVersion}+web.${FOR_YOU_WEB_VERSION}`;
}

export type FeedName = 'best' | 'for-you' | 'interleaved';

export type FeedDescriptor = {
  name: FeedName;
  /** For an interleaved page, `interleave(<a>,<b>)`. */
  version: string;
  /** Interleaved pages only. */
  experimentId?: string;
  arms?: { a: string; b: string };
};

export type ForYouReason = {
  topicId: string;
  topicName: string | null;
  kind: string;
  count: number | null;
  viaTopicId: string | null;
  viaTopicName: string | null;
  /** Short enough for a card, e.g. "4 votes on AI safety". */
  text: string;
};

export type ForYouScore = {
  /** Best's ranking_score. */
  best: number | null;
  /** The user's weight on the item's most-weighted topic, in interest units. */
  interest: number;
  /** What that interest added, in ranking-score units. */
  boost: number;
  total: number;
};

/** What a card knows about the ranking that put it there. */
export type FeedItemRanking = {
  /** The version that contributed this card. */
  version: string;
  /** Interleaved pages only: which arm picked it. */
  arm?: 'a' | 'b';
  experimentId?: string;
  reason?: ForYouReason | null;
  score?: ForYouScore;
  exploration?: boolean;
  /** The chance it had of being picked for an exploration slot. */
  explorationProbability?: number | null;
  /**
   * GEO-3221. `fresh` when the card filled Best's fresh slot rather than earning its rank; Best's
   * version then reads `best-1+fresh.<config revision>`.
   */
  slot?: 'fresh';
  /**
   * GEO-3234. Set in the browser on a card seen demotion moved down (or would have, had nothing
   * unseen been below it). The page's version then ends `+seen.<n>`.
   */
  seenDemoted?: boolean;
};
