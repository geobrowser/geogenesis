import { Effect } from 'effect';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { getResultsPage } from '~/core/io/queries';

import { type ClaimPickerEntity, fetchClaimPickerEntities } from './claim-picker-page';
import type { GraphClaimsPage } from './graph-claims';

/**
 * GEO-2704. The searching half of the graph tail.
 *
 * The ranked walk cannot answer a search. A substring filter over it measured at ten seconds
 * against testnet, because it has to walk a very long way to find few rows — the same reason a
 * narrow scope is slower than a wide one there.
 *
 * The REST `/search` endpoint is indexed and answers the same question in about half a second
 * (508ms unscoped, 361ms scoped to one space), which is what Explore already uses. It returns
 * matches rather than claims, so the ids are hydrated through the picker's projection afterwards —
 * two round trips, still a fraction of the one.
 */

/** Matches asked for per page. The endpoint caps a page at 100 however large a `limit` is sent. */
export const GRAPH_CLAIM_SEARCH_PAGE_SIZE = 25;

export type GraphClaimSearchQuery = {
  search: string;
  /**
   * Passed as the endpoint's single-space scope only when the viewer has narrowed to exactly one.
   * It takes one `space_id`, so a wider set is left to the caller's own gates — which drop a claim
   * whose home space it may not show anyway, and would have dropped it however it arrived.
   */
  spaceIds: string[] | null;
  topicIds?: string[];
  excludeIds?: string[];
};

/**
 * Offsets rather than cursors, which is what the endpoint offers. `total` is the pre-grouping count
 * of matches, so exhaustion is judged against how many were asked for rather than how many claims
 * came back — grouping and the gates below both shrink a page, and reading either as "the end"
 * would stop the list early.
 */
export async function fetchGraphClaimSearch(
  query: GraphClaimSearchQuery,
  offset: number,
  signal?: AbortSignal
): Promise<GraphClaimsPage & { nextOffset: number | null }> {
  const page = await Effect.runPromise(
    getResultsPage(
      {
        query: query.search,
        typeIds: [CLAIM_TYPE_ID],
        spaceId: query.spaceIds?.length === 1 ? query.spaceIds[0] : undefined,
        limit: GRAPH_CLAIM_SEARCH_PAGE_SIZE,
        offset,
      },
      signal
    )
  );

  const excluded = new Set(query.excludeIds ?? []);
  const ids = page.results.map(result => result.id).filter(id => !excluded.has(id));

  // Hydrated through the picker's projection so these rows are indistinguishable from the walk's:
  // same fields, same home-space resolution, same response-kind fallback.
  const entities = ids.length > 0 ? await fetchClaimPickerEntities(ids, signal) : [];
  const claims = query.topicIds?.length ? entities.filter(entity => carriesTopic(entity, query.topicIds!)) : entities;

  const consumed = offset + GRAPH_CLAIM_SEARCH_PAGE_SIZE;
  const hasNextPage = consumed < page.total;

  return { claims, endCursor: null, hasNextPage, nextOffset: hasNextPage ? consumed : null };
}

/**
 * The topic filter, applied here rather than in the request: `/search` has no topic parameter, and
 * the topics are already on the entities fetched above.
 */
function carriesTopic(entity: ClaimPickerEntity, topicIds: string[]) {
  return entity.relations.some(
    relation =>
      relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true && topicIds.includes(relation.toEntity.id)
  );
}

export const graphClaimSearchQueryKey = (query: GraphClaimSearchQuery) =>
  [
    'graph-claims',
    'search',
    query.search,
    query.spaceIds?.join(',') ?? null,
    (query.topicIds ?? []).join(','),
  ] as const;
