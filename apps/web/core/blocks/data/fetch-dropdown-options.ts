import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import type { EntityFilter, UuidFilter } from '~/core/gql/graphql';
import { convertWhereConditionToEntityFilter } from '~/core/io/converters';
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

export type DropdownOption = { id: string; name: string | null };

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
 */
export const DROPDOWN_POPULATION_PAGE_SIZE = 1000;
/**
 * Relations are read per chunk of population ids, in parallel. Latency is
 * dominated by fixed per-request cost (a 1000-id page costs the same as a
 * 200-id one), so pages are large and the relation lookups fan out; a dense
 * property (Types) has more relations than entities, so each chunk keeps
 * its own window instead of one capped query for the whole page.
 */
export const DROPDOWN_RELATION_CHUNK = 250;
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
  relations: { toEntity: { id: string; name: string | null } | null }[] | null;
};
type RelationsVariables = { propertyId: string; fromEntityIds: string[]; first: number };

const RELATIONS_DOCUMENT = parse(/* GraphQL */ `
  query DropdownOptionsRelations($propertyId: UUID!, $fromEntityIds: [UUID!], $first: Int) {
    relations(
      filter: { typeId: { is: $propertyId }, fromEntityId: { in: $fromEntityIds } }
      first: $first
      orderBy: TO_ENTITY_ID_ASC
    ) {
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

  let normalized = filter;
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

/** Distinct to-entities, name-sorted; a later relation never overwrites a known name with null. */
export function toDropdownOptions(result: RelationsResult): DropdownOption[] {
  const byId = new Map<string, DropdownOption>();
  for (const relation of result.relations ?? []) {
    const target = relation.toEntity;
    if (!target?.id) continue;
    const existing = byId.get(target.id);
    if (!existing || (!existing.name && target.name)) {
      byId.set(target.id, { id: target.id, name: target.name ?? null });
    }
  }
  return [...byId.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

export type DropdownOptionsPage = {
  options: DropdownOption[];
  endCursor: string | null;
  hasNextPage: boolean;
};

/** One page of the scope: the property's values across the next slice of the table's population. */
export function fetchDropdownOptionsPage({
  propertyId,
  where,
  after,
  signal,
}: {
  propertyId: string;
  where: WhereCondition;
  after?: string | null;
  signal?: AbortSignal;
}): Promise<DropdownOptionsPage> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const population = yield* graphql({
        query: POPULATION_PAGE_DOCUMENT,
        decoder: (data: PopulationPageResult) => ({
          ids: (data.entitiesConnection?.nodes ?? []).map(node => node.id),
          endCursor: data.entitiesConnection?.pageInfo.endCursor ?? null,
          hasNextPage: data.entitiesConnection?.pageInfo.hasNextPage ?? false,
        }),
        variables: populationVariablesFromWhere(where, DROPDOWN_POPULATION_PAGE_SIZE, after),
        signal,
      });

      if (population.ids.length === 0) {
        return { options: [], endCursor: population.endCursor, hasNextPage: false };
      }

      const chunks: string[][] = [];
      for (let start = 0; start < population.ids.length; start += DROPDOWN_RELATION_CHUNK) {
        chunks.push(population.ids.slice(start, start + DROPDOWN_RELATION_CHUNK));
      }

      const perChunk = yield* Effect.all(
        chunks.map(fromEntityIds =>
          graphql({
            query: RELATIONS_DOCUMENT,
            decoder: toDropdownOptions,
            variables: { propertyId, fromEntityIds, first: DROPDOWN_RELATION_WINDOW },
            signal,
          })
        ),
        { concurrency: RELATION_CHUNK_CONCURRENCY }
      );

      return {
        options: toDropdownOptions({
          relations: perChunk.flat().map(option => ({ toEntity: { id: option.id, name: option.name } })),
        }),
        endCursor: population.endCursor,
        hasNextPage: population.hasNextPage,
      };
    })
  );
}
