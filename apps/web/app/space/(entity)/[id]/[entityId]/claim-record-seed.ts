import {
  claimExploreRowPages,
  claimExploreRowsQueryKey,
  fetchClaimExploreRowsPage,
} from '~/core/claims/browse/claim-explore-rows';
import { getClaimSources } from '~/core/claims/browse/claim-sources';
import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import type { QuerySeedEntry } from '~/core/query-seed';
import {
  fetchTopicConnectionCountsBatch,
  topicConnectionCountsQueryKey,
  topicCountBatches,
} from '~/core/topics/browse/topic-connection-counts';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

/**
 * Past this many topic batches the Topics tab is left to the client. The tab holds its feed back
 * until every batch of counts has landed, so seeding some of them draws nothing; seeding all of an
 * unbounded list would put an unbounded fan-out in front of the first byte.
 */
const MAX_SEEDED_COUNT_BATCHES = 3;

/** The first request-page of explore rows for a claim-scoped id list, keyed as `useClaimExploreRows` keys it. */
async function firstRowsPage(ids: string[], spaceId: string): Promise<QuerySeedEntry[]> {
  const [page] = claimExploreRowPages(ids);
  if (!page) return [];
  return [{ queryKey: claimExploreRowsQueryKey(spaceId, page), data: await fetchClaimExploreRowsPage(page, spaceId) }];
}

/** What the claim's Sources tab fetches on the client: its source entities, as explore rows. */
export async function claimSourcesSeed(entity: Entity, spaceId: string): Promise<QuerySeedEntry[]> {
  return firstRowsPage(
    getClaimSources(entity.relations).map(source => source.id),
    spaceId
  );
}

/** What the claim's Topics tab fetches on the client: its topics as explore rows, and their counts. */
export async function claimTopicsSeed(entity: Entity, spaceId: string): Promise<QuerySeedEntry[]> {
  // The claim's order, deduped, as `ClaimTopicsTab` reads it.
  const seen = new Set<string>();
  const topicIds: string[] = [];
  for (const relation of entity.relations) {
    if (relation.isDeleted === true || !ID.equals(relation.type.id, TOPICS_PROPERTY_ID)) continue;
    const key = normId(relation.toEntity.id);
    if (seen.has(key)) continue;
    seen.add(key);
    topicIds.push(relation.toEntity.id);
  }

  const batches = topicCountBatches(topicIds);
  const [rows, counts] = await Promise.all([
    firstRowsPage(topicIds, spaceId),
    batches.length > MAX_SEEDED_COUNT_BATCHES
      ? []
      : Promise.all(
          batches.map(async ids => ({
            queryKey: topicConnectionCountsQueryKey(ids),
            data: await fetchTopicConnectionCountsBatch(ids),
          }))
        ),
  ]);

  return [...rows, ...counts];
}
