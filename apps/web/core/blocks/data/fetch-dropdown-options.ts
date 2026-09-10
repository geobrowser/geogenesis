import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import type { EntityFilter } from '~/core/gql/graphql';
import { convertWhereConditionToEntityFilter } from '~/core/io/converters';
import { collapseOrFilter } from '~/core/io/filter-or-collapse';
import { graphql } from '~/core/io/graphql-client';
import { getEntityNames } from '~/core/io/queries';
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
export type DropdownFacetEntry = { id: string; count: number };

/**
 * A dropdown's data comes from ONE grouped-aggregation query: the property's
 * relations, restricted to rows matching the population, grouped by target —
 * every option id with its exact count in a single request. Measured on the
 * live API: 19,309 values over a 60,744-row population in 2.7s; populations
 * narrowed by other dropdowns 0.8–1.6s; collection id-lists <1s. This
 * replaced a page-walked enumeration plus per-option totalCount queries
 * (0.7–4.6s EACH) once relationsConnection.groupedAggregates was found — the
 * same mechanism the debates hub facets use (tagged-claims.ts, GEO-2798).
 *
 * `distinctCount(fromEntityId)` counts DISTINCT rows per value, so a row
 * carrying duplicate relations to one value counts once — identical to the
 * old walk-tally semantics, and verified equal to the per-option totalCount.
 */
const DROPDOWN_FACET_DOCUMENT = parse(/* GraphQL */ `
  query DropdownFacet($typeId: UUID!, $fromEntity: EntityFilter) {
    relationsConnection(filter: { typeId: { is: $typeId }, fromEntity: $fromEntity }) {
      groupedAggregates(groupBy: TO_ENTITY_ID) {
        keys
        distinctCount {
          fromEntityId
        }
      }
    }
  }
`) as unknown as TypedDocumentNode<DropdownFacetResult, { typeId: string; fromEntity: EntityFilter | null }>;

type DropdownFacetResult = {
  relationsConnection: {
    groupedAggregates: Array<{
      keys: string[] | null;
      distinctCount: { fromEntityId: string | null } | null;
    } | null> | null;
  } | null;
};

/** Group keys and name lookups arrive in dashed and dashless forms; one canonical form for map keys. */
export function dropdownIdKey(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

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

/** Facet rows from the raw result: normalized ids, numeric counts, count-descending (stable by id). */
export function decodeDropdownFacet(result: DropdownFacetResult): DropdownFacetEntry[] {
  const entries: DropdownFacetEntry[] = [];
  for (const group of result.relationsConnection?.groupedAggregates ?? []) {
    const id = group?.keys?.[0];
    if (!id) continue;
    entries.push({ id: dropdownIdKey(id), count: Number(group?.distinctCount?.fromEntityId ?? 0) });
  }
  return entries.sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
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
      query: DROPDOWN_FACET_DOCUMENT,
      decoder: decodeDropdownFacet,
      variables: { typeId: columnId, fromEntity: populationToFromEntityFilter(population) },
      signal,
    })
  );
}

/** Batch size for name lookups — the API caps `first` at 1000. */
export const NAME_BATCH_SIZE = 900;

/** Names for a set of option ids, batched; keys normalized via dropdownIdKey. */
export async function fetchDropdownOptionNames(
  ids: string[],
  signal?: AbortSignal
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  for (let start = 0; start < ids.length; start += NAME_BATCH_SIZE) {
    const chunk = ids.slice(start, start + NAME_BATCH_SIZE);
    const rows = await Effect.runPromise(getEntityNames(chunk, signal));
    for (const row of rows) names.set(dropdownIdKey(row.id), row.name);
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
