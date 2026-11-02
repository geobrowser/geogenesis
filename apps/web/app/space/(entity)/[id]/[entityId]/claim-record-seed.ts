import {
  claimExploreRowPages,
  claimExploreRowsQueryKey,
  fetchClaimExploreRowsPage,
} from '~/core/claims/browse/claim-explore-rows';
import {
  claimRecordDirectDebatesKey,
  claimRecordFilters,
  fetchClaimRecordClaimsPage,
  fetchClaimRecordDirectDebates,
  firstClaimRecordClaimsPageParam,
} from '~/core/claims/browse/claim-record-query';
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

/**
 * What the claim's Related claims tab fetches on the client, for the space in the URL (the tab's
 * initial Spaces selection) and the default Best order: the direct debates, which the filters are
 * built from, then the first page of the claims query. Two requests, in sequence.
 *
 * Keyed as `useClaimRecord` keys them; the claims key ends in the candidate count, null unless
 * sorting by Top.
 */
export async function claimRelatedClaimsSeed(entity: Entity, spaceId: string): Promise<QuerySeedEntry[]> {
  const spaceIds = [spaceId];
  const topicIds = entity.relations
    .filter(relation => relation.isDeleted !== true && ID.equals(relation.type.id, TOPICS_PROPERTY_ID))
    .map(relation => relation.toEntity.id);

  const directDebates = await fetchClaimRecordDirectDebates({ claimId: entity.id, spaceIds });
  const filters = claimRecordFilters({ claimId: entity.id, spaceIds, topicIds, filterTopicIds: [], directDebates });
  const pageParam = firstClaimRecordClaimsPageParam(filters.hasTopics);
  const page = await fetchClaimRecordClaimsPage({ filters, spaceIds, sort: 'best', pageParam });

  const spaceKey = spaceIds.map(normId).sort().join(',');
  const recordKey = `${normId(entity.id)}:${spaceKey}:${topicIds.map(normId).sort().join(',')}:`;
  const claimsKey = ['claim-record', 'claims', recordKey, claimRecordDirectDebatesKey(directDebates), 'best', null];
  const claimsData = { pages: [page], pageParams: [pageParam] };

  return [
    { queryKey: ['claim-record', 'direct-debates', normId(entity.id), spaceKey], data: directDebates },
    { queryKey: claimsKey, data: claimsData },
  ];
}
