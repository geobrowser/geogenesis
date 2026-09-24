import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { normId } from '~/core/utils/norm-id';

export const MAX_TOPIC_FEED_SPACES = 100;
export const MAX_TOPIC_FEED_SELECTED_TOPICS = 10;

/** Canonical validation and deduplication for Topic feed ids from query strings or JSON bodies. */
export function parseTopicFeedIds(raw: unknown): string[] {
  const values = typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : [];
  const byCanonicalId = new Map<string, string>();
  for (const id of values) {
    if (typeof id !== 'string' || !IdUtils.isValid(id)) continue;
    const canonicalId = normId(id);
    if (!byCanonicalId.has(canonicalId)) byCanonicalId.set(canonicalId, id);
  }
  return [...byCanonicalId.values()];
}

/** Bounds the AND-composed Topic predicates accepted by both public Topic feed endpoints. */
export function parseTopicFeedSelectedIds(raw: unknown, pageTopicId: string): string[] {
  return parseTopicFeedIds(raw)
    .filter(id => normId(id) !== normId(pageTopicId))
    .slice(0, MAX_TOPIC_FEED_SELECTED_TOPICS);
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
