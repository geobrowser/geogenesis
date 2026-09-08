import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import type { EntityFilter, UuidFilter } from '~/core/gql/graphql';
import { convertWhereConditionToEntityFilter } from '~/core/io/converters';
import { collapseOrFilter } from '~/core/io/filter-or-collapse';
import { graphql } from '~/core/io/graphql-client';
import {
  extractSingleSpaceIdFromFilter,
  extractSpaceIdsFromFilter,
  removeSpaceIdsFromFilter,
} from '~/core/io/space-filter';
import {
  extractSingleTypeIdFromFilter,
  extractTypeIdsFromFilter,
  removeTypeIdsFromFilter,
} from '~/core/io/type-filter';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

/**
 * `count` is how many population rows carry this value, summed as the walk
 * progresses: exact once the scope is exhausted, a lower bound while more of
 * it remains. Undefined only for pinned entries the walk has not reached.
 */
export type DropdownOption = { id: string; name: string | null; count?: number };

/**
 * Where a dropdown's population comes from:
 * - `query`: the block's (overlaid) filter, walked via entitiesConnection —
 *   SPACES/GEO blocks.
 * - `ids`: an explicit ordered id list — COLLECTION blocks, whose membership
 *   is enumerated relations rather than a query. The `where` still applies
 *   (block filters and other dropdowns' selections narrow the population);
 *   it is evaluated server-side against each id slice.
 */
export type DropdownPopulation =
  { kind: 'query'; where: WhereCondition } | { kind: 'ids'; ids: string[]; where: WhereCondition };

/**
 * A dropdown's scope is the table's population: the entities the block's
 * filter — minus the dropdown's own property, so the user can widen it —
 * would show. Its options are the values that property takes across that
 * population, nothing wider.
 *
 * The API cannot execute a nested `relations(fromEntity: <filter>)` query
 * in reasonable time, so the population is walked page by page with the
 * same normalized connection query the table runs, and each page's
 * relations for the property are read by `fromEntityId` (indexed). Pages
 * are pulled as the user scrolls or searches.
 *
 * Per-option counts ride along for free: the walk already reads every
 * (row → value) relation, so counting rows per value is a tally, not a
 * query. A server-side COUNT per option was measured at 2–22s on the live
 * API and is deliberately not used.
 */
export const DROPDOWN_POPULATION_PAGE_SIZE = 1000;
/**
 * Relations are read per chunk of population ids, in parallel. Latency is
 * dominated by fixed per-request cost (a 1000-id page costs the same as a
 * 200-id one), so pages are large and the relation lookups fan out; a dense
 * property (Types) has more relations than entities, so each chunk keeps
 * its own window instead of one capped query for the whole page.
 */
export const DROPDOWN_RELATION_CHUNK = 100;
export const DROPDOWN_RELATION_WINDOW = 1000;
const RELATION_CHUNK_CONCURRENCY = 4;

type PopulationPageResult = {
  entitiesConnection: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string }[] } | null;
};
type PopulationPageVariables = {
  filter?: EntityFilter | null;
  spaceId?: string | null;
  spaceIds?: UuidFilter | null;
  typeId?: string | null;
  typeIds?: UuidFilter | null;
  first: number;
  after?: string | null;
};

const POPULATION_PAGE_DOCUMENT = parse(/* GraphQL */ `
  query DropdownOptionsPopulation(
    $filter: EntityFilter
    $spaceId: UUID
    $spaceIds: UUIDFilter
    $typeId: UUID
    $typeIds: UUIDFilter
    $first: Int
    $after: Cursor
  ) {
    entitiesConnection(
      filter: $filter
      spaceId: $spaceId
      spaceIds: $spaceIds
      typeId: $typeId
      typeIds: $typeIds
      first: $first
      after: $after
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
      }
    }
  }
`) as unknown as TypedDocumentNode<PopulationPageResult, PopulationPageVariables>;

type RelationsResult = {
  relations: { fromEntityId: string | null; toEntity: { id: string; name: string | null } | null }[] | null;
};
type RelationsChunk = { options: DropdownOption[]; windowHit: boolean };
type RelationsVariables = { propertyId: string; fromEntityIds: string[]; first: number };

const RELATIONS_DOCUMENT = parse(/* GraphQL */ `
  query DropdownOptionsRelations($propertyId: UUID!, $fromEntityIds: [UUID!], $first: Int) {
    relations(
      filter: { typeId: { is: $propertyId }, fromEntityId: { in: $fromEntityIds } }
      first: $first
      orderBy: TO_ENTITY_ID_ASC
    ) {
      fromEntityId
      toEntity {
        id
        name
      }
    }
  }
`) as unknown as TypedDocumentNode<RelationsResult, RelationsVariables>;

/**
 * Same promotion as `core/io/queries.ts`: space/type constraints move to the
 * top-level connection arguments (the indexed path) and leave the filter.
 */
export function populationVariablesFromWhere(
  where: WhereCondition,
  first: number,
  after?: string | null
): PopulationPageVariables {
  const filter = Object.keys(where).length === 0 ? undefined : convertWhereConditionToEntityFilter(where);
  const spaceId = extractSingleSpaceIdFromFilter(filter);
  const spaceIds = spaceId ? undefined : extractSpaceIdsFromFilter(filter);
  const typeId = extractSingleTypeIdFromFilter(filter);
  const typeIds = typeId ? undefined : extractTypeIdsFromFilter(filter);

  // Collapse OR-ed branches before anything else uses the filter — the OR
  // forms make Postgres scan until the 30s statement timeout (see
  // filter-or-collapse.ts). Same normalization, same order, as
  // core/io/queries.ts.
  let normalized = collapseOrFilter(filter);
  if (spaceId || spaceIds) normalized = removeSpaceIdsFromFilter(normalized);
  if (typeId || typeIds) normalized = removeTypeIdsFromFilter(normalized);

  return {
    filter: normalized ?? null,
    spaceId: spaceId ?? null,
    spaceIds: spaceIds ?? null,
    typeId: typeId ?? null,
    typeIds: typeIds ?? null,
    first,
    after: after ?? null,
  };
}

/**
 * Variables asking "which of these ids match the where" — the population
 * check for an id-list (collection) slice. The id constraint joins the
 * normalized filter; space/type promotion applies as usual.
 */
export function populationVariablesForIds(ids: string[], where: WhereCondition): PopulationPageVariables {
  const variables = populationVariablesFromWhere(where, ids.length);
  return {
    ...variables,
    filter: { ...(variables.filter ?? {}), id: { in: ids } } as EntityFilter,
  };
}

/**
 * Tally one relations result into options: distinct to-entities, name-sorted,
 * each counting its DISTINCT from-entities — a row with duplicate relations
 * to the same value counts once. A later relation never overwrites a known
 * name with null.
 */
export function tallyDropdownOptions(result: RelationsResult): DropdownOption[] {
  const byId = new Map<string, { id: string; name: string | null; fromIds: Set<string> }>();
  for (const relation of result.relations ?? []) {
    const target = relation.toEntity;
    if (!target?.id) continue;
    const existing = byId.get(target.id);
    if (!existing) {
      byId.set(target.id, { id: target.id, name: target.name ?? null, fromIds: new Set() });
    } else if (!existing.name && target.name) {
      existing.name = target.name;
    }
    if (relation.fromEntityId) byId.get(target.id)?.fromIds.add(relation.fromEntityId);
  }
  return [...byId.values()]
    .map(({ id, name, fromIds }) => ({ id, name, count: fromIds.size }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

/**
 * Merge option lists whose underlying from-entity sets are DISJOINT (relation
 * chunks of one page, split halves of one chunk, successive walk pages), so
 * counts add. Names keep the first known value; order is name-sorted.
 */
export function mergeDropdownOptionCounts(lists: DropdownOption[][]): DropdownOption[] {
  const byId = new Map<string, DropdownOption>();
  for (const list of lists) {
    for (const option of list) {
      const existing = byId.get(option.id);
      if (!existing) {
        byId.set(option.id, { ...option });
        continue;
      }
      if (!existing.name && option.name) existing.name = option.name;
      if (option.count !== undefined) existing.count = (existing.count ?? 0) + option.count;
    }
  }
  return [...byId.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

export type DropdownOptionsPage = {
  options: DropdownOption[];
  endCursor: string | null;
  hasNextPage: boolean;
  /** Entities checked by this page — the walk's progress unit. */
  populationCount: number;
};

/**
 * Relations for one id-chunk. A chunk that fills the server's window would
 * silently truncate (a dense property can carry more relations than the
 * window per chunk), so a full window splits the chunk and recurses; a
 * single id that still fills the window has >1000 distinct-ish relations
 * and keeps the first window's worth.
 */
function fetchRelationsForChunk({
  propertyId,
  fromEntityIds,
  signal,
}: {
  propertyId: string;
  fromEntityIds: string[];
  signal?: AbortSignal;
}): Effect.Effect<DropdownOption[], unknown> {
  return Effect.gen(function* () {
    const chunk: RelationsChunk = yield* graphql({
      query: RELATIONS_DOCUMENT,
      decoder: (result: RelationsResult) => ({
        options: tallyDropdownOptions(result),
        windowHit: (result.relations ?? []).length >= DROPDOWN_RELATION_WINDOW,
      }),
      variables: { propertyId, fromEntityIds, first: DROPDOWN_RELATION_WINDOW },
      signal,
    });

    if (!chunk.windowHit || fromEntityIds.length <= 1) {
      return chunk.options;
    }

    const middle = Math.ceil(fromEntityIds.length / 2);
    const halves = yield* Effect.all(
      [
        fetchRelationsForChunk({ propertyId, fromEntityIds: fromEntityIds.slice(0, middle), signal }),
        fetchRelationsForChunk({ propertyId, fromEntityIds: fromEntityIds.slice(middle), signal }),
      ],
      { concurrency: 2 }
    );
    // Halves partition the ids, so their per-option counts add.
    return mergeDropdownOptionCounts(halves);
  });
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

/** The next slice of an id-list population, with its cursor math. */
export function slicePopulationIds(
  ids: string[],
  after: string | null | undefined
): { slice: string[]; endCursor: string | null; hasNextPage: boolean } {
  const offset = after ? Number.parseInt(after, 10) || 0 : 0;
  const slice = ids.slice(offset, offset + DROPDOWN_POPULATION_PAGE_SIZE);
  const end = offset + slice.length;
  return { slice, endCursor: String(end), hasNextPage: end < ids.length };
}

function fetchPopulationIds(
  population: DropdownPopulation,
  after: string | null | undefined,
  signal?: AbortSignal
): Effect.Effect<{ ids: string[]; populationCount: number; endCursor: string | null; hasNextPage: boolean }, unknown> {
  return Effect.gen(function* () {
    if (population.kind === 'ids') {
      const { slice, endCursor, hasNextPage } = slicePopulationIds(population.ids, after);
      if (slice.length === 0) {
        return { ids: [], populationCount: 0, endCursor, hasNextPage: false };
      }
      if (Object.keys(population.where).length === 0) {
        return { ids: slice, populationCount: slice.length, endCursor, hasNextPage };
      }
      // The where narrows which collection rows belong to the population
      // (block filters plus other dropdowns' selections); ask the server
      // which of this slice's ids survive it.
      const matching = yield* graphql({
        query: POPULATION_PAGE_DOCUMENT,
        decoder: (data: PopulationPageResult) => (data.entitiesConnection?.nodes ?? []).map(node => node.id),
        variables: populationVariablesForIds(slice, population.where),
        signal,
      });
      return { ids: matching, populationCount: slice.length, endCursor, hasNextPage };
    }

    const page = yield* graphql({
      query: POPULATION_PAGE_DOCUMENT,
      decoder: (data: PopulationPageResult) => ({
        ids: (data.entitiesConnection?.nodes ?? []).map(node => node.id),
        endCursor: data.entitiesConnection?.pageInfo.endCursor ?? null,
        hasNextPage: data.entitiesConnection?.pageInfo.hasNextPage ?? false,
      }),
      variables: populationVariablesFromWhere(population.where, DROPDOWN_POPULATION_PAGE_SIZE, after),
      signal,
    });
    return {
      ids: page.ids,
      populationCount: page.ids.length,
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  });
}

type OptionCountResult = { entitiesConnection: { totalCount: number } | null };
type OptionCountVariables = Omit<PopulationPageVariables, 'first' | 'after'>;

const OPTION_COUNT_DOCUMENT = parse(/* GraphQL */ `
  query DropdownOptionCount(
    $filter: EntityFilter
    $spaceId: UUID
    $spaceIds: UUIDFilter
    $typeId: UUID
    $typeIds: UUIDFilter
  ) {
    entitiesConnection(
      filter: $filter
      spaceId: $spaceId
      spaceIds: $spaceIds
      typeId: $typeId
      typeIds: $typeIds
      first: 1
    ) {
      totalCount
    }
  }
`) as unknown as TypedDocumentNode<OptionCountResult, OptionCountVariables>;

/**
 * Variables for one option's exact count: the population where (space/type
 * promoted as usual) AND-combined with the option's relation predicate.
 * Single-predicate counts measured 0.7–4.6s on the live API; the OR shapes
 * that measured 22s never occur here — each badge is its own query.
 */
export function optionCountVariables(where: WhereCondition, columnId: string, optionId: string): OptionCountVariables {
  const { filter, spaceId, spaceIds, typeId, typeIds } = populationVariablesFromWhere(where, 1);
  const predicate = { relations: { some: { typeId: { is: columnId }, toEntityId: { is: optionId } } } } as EntityFilter;
  return {
    filter: filter ? ({ and: [filter, predicate] } as EntityFilter) : predicate,
    spaceId,
    spaceIds,
    typeId,
    typeIds,
  };
}

/**
 * Exact counts are fired per revealed option, so cap how many run at once:
 * a screenful (25) at concurrency 6 measured ~4s wall on the live API, and
 * an unbounded burst would contend with the population walk's own requests.
 */
const OPTION_COUNT_CONCURRENCY = 6;
let activeCountRequests = 0;
const countWaiters: (() => void)[] = [];

async function withCountSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeCountRequests >= OPTION_COUNT_CONCURRENCY) {
    await new Promise<void>(resolve => countWaiters.push(resolve));
  }
  activeCountRequests++;
  try {
    return await run();
  } finally {
    activeCountRequests--;
    countWaiters.shift()?.();
  }
}

/** The exact number of population rows carrying this option's value. */
export function fetchExactOptionCount({
  columnId,
  optionId,
  where,
  signal,
}: {
  columnId: string;
  optionId: string;
  where: WhereCondition;
  signal?: AbortSignal;
}): Promise<number> {
  return withCountSlot(() =>
    Effect.runPromise(
      graphql({
        query: OPTION_COUNT_DOCUMENT,
        decoder: (result: OptionCountResult) => result.entitiesConnection?.totalCount ?? 0,
        variables: optionCountVariables(where, columnId, optionId),
        signal,
      })
    )
  );
}

/** One page of the scope: the property's values across the next slice of the table's population. */
export function fetchDropdownOptionsPage({
  propertyId,
  population,
  after,
  signal,
}: {
  propertyId: string;
  population: DropdownPopulation;
  after?: string | null;
  signal?: AbortSignal;
}): Promise<DropdownOptionsPage> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const { ids, populationCount, endCursor, hasNextPage } = yield* fetchPopulationIds(population, after, signal);

      if (ids.length === 0) {
        return { options: [], endCursor, hasNextPage, populationCount };
      }

      const chunks: string[][] = [];
      for (let start = 0; start < ids.length; start += DROPDOWN_RELATION_CHUNK) {
        chunks.push(ids.slice(start, start + DROPDOWN_RELATION_CHUNK));
      }

      const perChunk = yield* Effect.all(
        chunks.map(fromEntityIds => fetchRelationsForChunk({ propertyId, fromEntityIds, signal })),
        { concurrency: RELATION_CHUNK_CONCURRENCY }
      );

      return {
        // Chunks partition the page's ids, so their counts add.
        options: mergeDropdownOptionCounts(perChunk),
        endCursor,
        hasNextPage,
        populationCount,
      };
    })
  );
}
