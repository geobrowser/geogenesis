import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { normId } from '~/core/utils/norm-id';

export const MAX_TOPIC_FEED_SPACES = 100;
export const MAX_TOPIC_FEED_SELECTED_TOPICS = 10;

/** Canonical validation and deduplication for Topic feed ids from query strings or JSON bodies. */
export function parseTopicFeedIds(raw: unknown, options: { dashless?: boolean } = {}): string[] {
  const values = typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : [];
  const byCanonicalId = new Map<string, string>();
  for (const id of values) {
    if (typeof id !== 'string' || !IdUtils.isValid(id)) continue;
    const canonicalId = normId(id);
    if (!byCanonicalId.has(canonicalId)) byCanonicalId.set(canonicalId, options.dashless ? canonicalId : id);
  }
  return [...byCanonicalId.values()];
}

/**
 * Bounds the AND-composed Topic predicates accepted by the public Topic feed endpoints. Shared by
 * the Topic pages and Explore so their validation and cap cannot drift apart; the two call-site
 * differences are options:
 *
 * - `pageTopicId`: a topic page drops its own topic, which every row already carries. A topic space
 *   and Explore have no page topic in the predicate, so they pass none.
 * - `dashless`: Explore returns normalized ids; the Topic pages keep the original spelling.
 */
export function parseTopicFeedSelectedIds(
  raw: unknown,
  options: { pageTopicId?: string; dashless?: boolean } = {}
): string[] {
  const ids = parseTopicFeedIds(raw, { dashless: options.dashless });
  const { pageTopicId } = options;
  return (pageTopicId ? ids.filter(id => normId(id) !== normId(pageTopicId)) : ids).slice(
    0,
    MAX_TOPIC_FEED_SELECTED_TOPICS
  );
}

/**
 * The bounded, deduplicated space scope shared by the Topic header, feed and facets.
 *
 * The route space is the context the reader deliberately opened, so it owns one slot before the
 * curated scope is truncated. This is also applied server-side: API callers are not required to
 * have gone through the current client.
 */
export function limitTopicFeedSpaceIds(
  spaceIds: readonly string[] | undefined,
  routeSpaceId?: string
): string[] | undefined {
  if (spaceIds === undefined) return undefined;
  const parsed = parseTopicFeedIds(spaceIds);
  if (!routeSpaceId || !IdUtils.isValid(routeSpaceId)) return parsed.slice(0, MAX_TOPIC_FEED_SPACES);

  return [routeSpaceId, ...parsed.filter(id => normId(id) !== normId(routeSpaceId))].slice(0, MAX_TOPIC_FEED_SPACES);
}

export function parseTopicFeedSpaceIds(raw: unknown, routeSpaceId?: string): string[] {
  return limitTopicFeedSpaceIds(parseTopicFeedIds(raw), routeSpaceId) ?? [];
}
