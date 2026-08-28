import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect, Either } from 'effect';

import { DATA_BLOCK_VIEW_EXPLORE_ID } from '~/core/data-block-ids';
import { graphql } from '~/core/io/subgraph/graphql';

import { DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID } from './block-ontology-ids';
import type { ExploreBlockRelation } from './explore-infinite-scroll-backfill';

const PAGE_SIZE = 500;
const MAX_PAGES = 100;

type ExploreViewRelationsPage = {
  relationsConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      spaceId: string | null;
      fromEntity: {
        id: string;
        valuesList: Array<{ spaceId: string | null; propertyId: string | null }> | null;
      } | null;
    } | null>;
  } | null;
};

function buildPageQuery(after: string | null): string {
  const afterArg = after ? `, after: "${after}"` : '';
  return `query {
    relationsConnection(
      first: ${PAGE_SIZE}${afterArg}
      filter: {
        typeId: { is: "${SystemIds.VIEW_PROPERTY}" }
        toEntityId: { is: "${DATA_BLOCK_VIEW_EXPLORE_ID}" }
      }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        spaceId
        fromEntity {
          id
          valuesList(filter: { propertyId: { is: "${DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID}" } }) {
            spaceId
            propertyId
          }
        }
      }
    }
  }`;
}

/**
 * Map a GraphQL Explore VIEW relation node into the backfill planner's input row.
 */
export function mapExploreViewRelationNode(node: {
  spaceId: string | null;
  fromEntity: {
    id: string;
    valuesList: Array<{ spaceId: string | null; propertyId: string | null }> | null;
  } | null;
}): ExploreBlockRelation | null {
  if (!node.fromEntity?.id || !node.spaceId) return null;

  const hasInfiniteScrollValue = (node.fromEntity.valuesList ?? []).some(
    value => value.propertyId === DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID && value.spaceId === node.spaceId
  );

  return {
    relationEntityId: node.fromEntity.id,
    spaceId: node.spaceId,
    view: 'EXPLORE',
    hasInfiniteScrollValue,
  };
}

/**
 * Page every VIEW → Explore relation and return the Blocks relation entities that need planning.
 */
export async function fetchExploreBlockRelationsForBackfill(
  apiEndpoint: string,
  signal?: AbortController['signal']
): Promise<ExploreBlockRelation[]> {
  const out: ExploreBlockRelation[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result: Either.Either<ExploreViewRelationsPage, unknown> = await Effect.runPromise(
      Effect.either(
        graphql<ExploreViewRelationsPage>({
          endpoint: apiEndpoint,
          query: buildPageQuery(after),
          signal,
        })
      )
    );

    if (Either.isLeft(result)) {
      throw new Error(`Failed to fetch Explore VIEW relations: ${String(result.left)}`);
    }

    const connection: ExploreViewRelationsPage['relationsConnection'] = result.right.relationsConnection;
    if (!connection) return out;

    for (const node of connection.nodes) {
      if (!node) continue;
      const mapped = mapExploreViewRelationNode(node);
      if (mapped) out.push(mapped);
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) return out;
    after = connection.pageInfo.endCursor;
  }

  // Falling out of the loop means `hasNextPage` was still true at MAX_PAGES. Returning here would
  // hand back a partial set that the caller cannot tell apart from a complete one, and this feeds a
  // one-shot migration — a silently partial backfill looks like a successful one.
  throw new Error(
    `Explore VIEW relations exceeded ${MAX_PAGES} pages of ${PAGE_SIZE}; raise MAX_PAGES rather than backfilling a partial set`
  );
}
