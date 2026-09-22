import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { normId } from '~/core/utils/norm-id';

export const MAX_TOPIC_FEED_SPACES = 100;

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

/** The bounded, deduplicated space scope shared by the Topic header, feed and facets. */
export function limitTopicFeedSpaceIds(spaceIds: readonly string[] | undefined): string[] | undefined {
  if (spaceIds === undefined) return undefined;
  return parseTopicFeedIds(spaceIds).slice(0, MAX_TOPIC_FEED_SPACES);
}

export function parseTopicFeedSpaceIds(raw: unknown): string[] {
  return parseTopicFeedIds(raw).slice(0, MAX_TOPIC_FEED_SPACES);
}
