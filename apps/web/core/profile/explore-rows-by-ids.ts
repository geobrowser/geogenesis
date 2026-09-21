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

/** Ids per request. Matches the page size, so a full chunk is never truncated. */
const ID_BATCH_SIZE = 100;

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
    entitiesConnection(filter: { id: { in: $ids } }, first: ${ID_BATCH_SIZE}) {
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
export async function fetchExploreRowsByIds(
  ids: string[],
  signal?: AbortSignal,
  /**
   * The spaces each id may be read in, where the caller knows.
   *
   * A debate's side relation names the space the debate lives in, and a vote
   * names the space the claim was answered in. Without either,
   * `pickDisplaySpaceId` takes the first of the entity's own spaces — so a
   * record carried in more than one resolved its label, its claims and its link
   * against whichever happened to come first.
   *
   * Several per id, because a caller can know several: the same claim answered
   * in two spaces gives two, and `pickDisplaySpaceId` picks between them by
   * where the entity is actually typed rather than by which answer was newest.
   */
  preferredSpaceById?: Map<string, string[]>
): Promise<ExploreFeedRow[]> {
  if (ids.length === 0) return [];

  // Chunked, because `first` bounds the answer and the callers do not bound the
  // question. `usePersonDebates` hands over everything the relation query found
  // — up to 200 — against a page that returned 100, so a profile with more than
  // a hundred debates silently lost cards. Not even predictably: `in` does not
  // preserve input order, so the missing one was whichever the index returned
  // last, rather than the oldest.
  //
  // The same shape `fetchRelationsByToEntityIds` uses for the same reason.
  const entities: ExploreCardEntity[] = [];

  for (let start = 0; start < ids.length; start += ID_BATCH_SIZE) {
    const chunk = ids.slice(start, start + ID_BATCH_SIZE);

    entities.push(
      ...(await Effect.runPromise(
        graphql({
          query: exploreRowsByIdsDocument,
          decoder: decode,
          variables: { ids: chunk.map(ID.uuidToHex) },
          signal,
        })
      ))
    );
  }

  return buildExploreRowsByIds(ids, entities, preferredSpaceById);
}

/**
 * Build card rows from an already-fetched Explore projection while preserving the caller's order.
 *
 * Most records discover ids and hydrate them in separate requests, but small bounded summaries can
 * select the same projection with their discovery query. Keeping the row assembly here means both
 * paths make the same display-space choice and neither has to reimplement Explore-card semantics.
 */
export function buildExploreRowsByIds(
  ids: readonly string[],
  entities: readonly ExploreCardEntity[],
  preferredSpaceById?: Map<string, string[]>
): ExploreFeedRow[] {
  const byId = new Map(entities.map(entity => [normId(entity.id), entity]));
  const ordered = ids
    .map(id => byId.get(normId(id)))
    .filter((entity): entity is ExploreCardEntity => entity !== undefined);

  // Built one at a time so each can be given its own allowed set: the caller's
  // space where it named one, and otherwise every space the entity is in.
  // `buildExploreFeedRows` takes a single set for the whole batch, which cannot
  // express "this one belongs to that space".
  //
  // No membership context either way, so the cards render with their Join
  // button hidden rather than in a state this query cannot determine.
  return ordered.flatMap(entity => {
    const preferred = preferredSpaceById?.get(normId(entity.id))?.filter(validateSpaceId) ?? [];
    const allowed = preferred.length
      ? new Set(preferred.map(normId))
      : new Set(entity.spaces.filter(validateSpaceId).map(normId));

    return buildExploreFeedRows([entity], allowed, new Set());
  });
}
