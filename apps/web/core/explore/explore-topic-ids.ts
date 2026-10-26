import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { normId } from '~/core/utils/norm-id';

export const MAX_EXPLORE_TOPIC_SELECTIONS = 10;

/**
 * Validates, deduplicates and caps Explore topic ids from a query string or JSON body. Shared by the
 * feed and facet routes so neither takes an unbounded list. Ids come back dashless.
 */
export function parseExploreTopicIds(raw: unknown): string[] {
  const values = typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : [];
  const byCanonicalId = new Map<string, string>();
  for (const id of values) {
    if (typeof id !== 'string' || !IdUtils.isValid(id)) continue;
    const canonicalId = normId(id);
    if (!byCanonicalId.has(canonicalId)) byCanonicalId.set(canonicalId, canonicalId);
  }
  return [...byCanonicalId.values()].slice(0, MAX_EXPLORE_TOPIC_SELECTIONS);
}
