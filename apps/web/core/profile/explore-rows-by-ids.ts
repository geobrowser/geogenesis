import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import {
  type ExploreCardEntity,
  type ExploreFeedRow,
  buildExploreFeedRows,
  decodeExploreCardEntity,
} from '~/core/explore/explore-card-item';
import { exploreCardNodeFields, exploreCardPropertyFragment } from '~/core/explore/explore-card-selection';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';
import { validateSpaceId } from '~/core/utils/utils';

const FRAGMENT = 'ProfileExploreRowsFragment';

/**
 * Entities by id, selected exactly as the explore feed selects them.
 *
 * Both record tabs answer the same question in two steps — *which* things, then
 * *what* they are — and the second step is identical. Positions gets its ids
 * from the vote table, Debates from the side relations; from here they are the
 * same list of ids and become the same cards.
 *
 * Unscoped to spaces on purpose. A person's record spans the whole graph, so
 * there is no space list to narrow by before the rows say which spaces they
 * came from.
 */
const SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(FRAGMENT)}

  query ProfileExploreRows($ids: [UUID!]) {
    entitiesConnection(filter: { id: { in: $ids } }, first: 100) {
      nodes {
        ${exploreCardNodeFields(FRAGMENT, { scopeListsToSpaces: false })}
      }
    }
  }
`;

export const exploreRowsByIdsDocument = parse(SOURCE) as TypedDocumentNode<any, any>;

type Response = { entitiesConnection?: { nodes?: unknown[] | null } | null };

function decode(response: Response): ExploreCardEntity[] {
  const entities: ExploreCardEntity[] = [];

  for (const node of response.entitiesConnection?.nodes ?? []) {
    const decoded = decodeExploreCardEntity(node);
    if (decoded) entities.push(decoded);
  }

  return entities;
}

/**
 * Explore rows for these ids, in the order the ids were given.
 *
 * The order matters and is not the index's. A record sorted by whatever the
 * entity query happened to return is not sorted by anything the reader can see,
 * so the caller's order — most recently voted, most recently argued — is
 * restored before the rows are built.
 *
 * Ids the graph has nothing for are dropped rather than rendered empty.
 */
export async function fetchExploreRowsByIds(ids: string[], signal?: AbortSignal): Promise<ExploreFeedRow[]> {
  if (ids.length === 0) return [];

  const entities = await Effect.runPromise(
    graphql({
      query: exploreRowsByIdsDocument,
      decoder: decode,
      variables: { ids: ids.map(ID.uuidToHex) },
      signal,
    })
  );

  const byId = new Map(entities.map(entity => [normId(entity.id), entity]));
  const ordered = ids
    .map(id => byId.get(normId(id)))
    .filter((entity): entity is ExploreCardEntity => entity !== undefined);

  const openableSpaceIds = new Set(ordered.flatMap(e => e.spaces.filter(validateSpaceId).map(normId)));

  // No membership context, so the cards render with their Join button hidden
  // rather than in a state this query cannot determine.
  return buildExploreFeedRows(ordered, openableSpaceIds, new Set());
}
