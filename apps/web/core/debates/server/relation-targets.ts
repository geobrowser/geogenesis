import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { ENTITY_ID_BATCH_CONCURRENCY, RELATIONS_PAGE_SIZE, batchEntityIds } from '~/core/io/queries';
import { type CursorPage, collectCursorPages } from '~/core/sync/collect-cursor-pages';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';

/**
 * Relations of the given types from a set of entities, in one space. A cursor connection rather
 * than a nested `relationsList(first: …)`: the publisher writes what these reads tell it once and
 * never revisits it, so a capped read would make a permanent decision on an incomplete set.
 */
const RELATION_TARGETS_SOURCE = /* GraphQL */ `
  query RelationTargets($fromEntityIds: [UUID!]!, $typeIds: [UUID!]!, $spaceId: UUID!, $first: Int!, $after: Cursor) {
    relationsConnection(
      first: $first
      after: $after
      filter: { fromEntityId: { in: $fromEntityIds }, typeId: { in: $typeIds }, spaceId: { is: $spaceId } }
    ) {
      nodes {
        fromEntityId
        typeId
        toEntityId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type RelationTargetsQuery = {
  relationsConnection: {
    nodes: Array<{ fromEntityId: string | null; typeId: string | null; toEntityId: string | null } | null>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  } | null;
};

const relationTargetsDocument = parse(RELATION_TARGETS_SOURCE) as TypedDocumentNode<
  RelationTargetsQuery,
  { fromEntityIds: string[]; typeIds: string[]; spaceId: string; first: number; after: string | null }
>;

export type RelationTarget = { fromEntityId: string; typeId: string; toEntityId: string };

export type RelationTargetsRequest = { fromEntityIds: string[]; typeIds: string[]; spaceId: string };

/** One page of relation targets. Injectable for tests. */
export type RelationTargetsPageFetcher = (
  request: RelationTargetsRequest,
  after: string | undefined
) => Promise<CursorPage<RelationTarget>>;

const fetchPageFromGraph: RelationTargetsPageFetcher = (request, after) =>
  Effect.runPromise(
    graphql({
      query: relationTargetsDocument,
      decoder: data => ({
        items: (data.relationsConnection?.nodes ?? []).flatMap(node =>
          node?.fromEntityId && node.typeId && node.toEntityId
            ? [{ fromEntityId: node.fromEntityId, typeId: node.typeId, toEntityId: node.toEntityId }]
            : []
        ),
        endCursor: data.relationsConnection?.pageInfo.endCursor ?? null,
        hasNextPage: data.relationsConnection?.pageInfo.hasNextPage ?? false,
      }),
      variables: { ...request, first: RELATIONS_PAGE_SIZE, after: after ?? null },
    })
  );

/**
 * Every matching relation, however many there are. The source ids are batched under the API's
 * per-request cap and each batch is paged to exhaustion.
 *
 * Throws on a failed page or a broken cursor chain (see `collectCursorPages`): a partial list is
 * never returned as though it were the whole set. Callers decide what an unanswered read means.
 */
export async function collectRelationTargets(
  request: RelationTargetsRequest,
  fetchPage: RelationTargetsPageFetcher = fetchPageFromGraph
): Promise<RelationTarget[]> {
  // Batches are independent, so they are read concurrently (capped like every other entity-id batch
  // read); pages within a batch cannot be.
  const results = await mapWithConcurrency(
    batchEntityIds(request.fromEntityIds),
    ENTITY_ID_BATCH_CONCURRENCY,
    fromEntityIds => collectCursorPages(after => fetchPage({ ...request, fromEntityIds }, after))
  );
  return results.flat();
}
