import { Effect } from 'effect';

import type { EntityFilter } from '~/core/gql/graphql';
import { uuidToHex } from '~/core/id/normalize';
import { convertWhereConditionToEntityFilter } from '~/core/io/converters';
import { collapseOrFilter } from '~/core/io/filter-or-collapse';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
import {
  type RelationFacetCount,
  type RelationFacetResult,
  decodeRelationFacet,
  relationFacetDocument,
} from '~/core/io/relation-facet';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

/**
 * Where a dropdown's population comes from:
 * - `query`: the block's (overlaid) filter — SPACES/GEO blocks.
 * - `ids`: an explicit ordered id list — COLLECTION blocks, whose membership
 *   is enumerated relations rather than a query. The `where` still applies
 *   (block filters and other dropdowns' selections narrow the population).
 */
export type DropdownPopulation =
  { kind: 'query'; where: WhereCondition } | { kind: 'ids'; ids: string[]; where: WhereCondition };

/** One facet row: an option's entity id and how many population rows carry it. */
export type DropdownFacetEntry = RelationFacetCount;

/*
 * A dropdown's data comes from ONE grouped-aggregation request — the shared
 * relation-facet query (core/io/relation-facet.ts), the same document the
 * debates hub facets run. Measured on the live API: 19,309 values over a
 * 60,744-row population in 2.7s; populations narrowed by other dropdowns
 * 0.8-1.6s; collection id-lists <1s. This replaced a page-walked enumeration
 * plus per-option totalCount queries (0.7-4.6s EACH).
 */

/**
 * The population as a `fromEntity` filter. relationsConnection has no
 * top-level space/type promotion — everything rides in the EntityFilter —
 * but the OR-collapse normalization still applies (core/io/queries.ts
 * parity; un-collapsed ORs scan until the statement timeout).
 *
 * Deliberately WITHOUT the empty-name exclusion the row queries carry:
 * inside a grouped aggregate it costs ~7× (18.8s vs 2.7s measured on a 60k
 * population) while changing no counts in measurement — a documented trade,
 * not a silent one.
 */
export function populationToFromEntityFilter(population: DropdownPopulation): EntityFilter | null {
  const base =
    Object.keys(population.where).length === 0
      ? undefined
      : (collapseOrFilter(convertWhereConditionToEntityFilter(population.where, { includeEmptyNames: true })) ??
        undefined);
  if (population.kind === 'ids') {
    const idClause = { id: { in: population.ids } } as EntityFilter;
    return base ? ({ and: [base, idClause] } as EntityFilter) : idClause;
  }
  return base ?? null;
}

/** Facet rows for a dropdown: the shared decode, ordered count-descending (stable by id). */
export function decodeDropdownFacet(result: RelationFacetResult): DropdownFacetEntry[] {
  return decodeRelationFacet(result).sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
}

/** Every option of one property across the population, with exact counts — one request. */
export function fetchDropdownFacet({
  columnId,
  population,
  signal,
}: {
  columnId: string;
  population: DropdownPopulation;
  signal?: AbortSignal;
}): Promise<DropdownFacetEntry[]> {
  return Effect.runPromise(
    graphql({
      query: relationFacetDocument,
      decoder: decodeDropdownFacet,
      variables: {
        typeId: columnId,
        toEntityId: null,
        fromEntity: populationToFromEntityFilter(population),
        groupBy: ['TO_ENTITY_ID'],
      },
      signal,
    })
  );
}

/** Batch size for name lookups — the API caps `first` at 1000. */
export const NAME_BATCH_SIZE = 900;

/** Names for a set of option ids, batched; keys normalized via uuidToHex. */
export async function fetchDropdownOptionNames(
  ids: string[],
  signal?: AbortSignal
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  for (let start = 0; start < ids.length; start += NAME_BATCH_SIZE) {
    const chunk = ids.slice(start, start + NAME_BATCH_SIZE);
    const rows = await Effect.runPromise(getEntityNames(chunk, signal));
    for (const row of rows) names.set(uuidToHex(row.id), row.name);
  }
  return names;
}

/** Cheap stable fingerprint for an id list — FNV-1a over the joined ids. */
export function fingerprintIdList(ids: string[]): string {
  let hash = 0x811c9dc5;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x2c; // separator
    hash = Math.imul(hash, 0x01000193);
  }
  return `${ids.length}:${(hash >>> 0).toString(36)}`;
}
